import { CatmullRomCurve3, Group, Vector3 } from 'three';
import type { World } from '../sim/world/World';
import type { BakedLighting } from '../render/lighting/BakedLighting';
import { GameRenderer } from '../render/Renderer';
import { CharacterModel } from '../render/CharacterModel';
import { weaponModel } from '../render/WeaponModels';
import { verticalFov } from '../render/MatchView';
import { sfx } from '../audio/Sfx';
import { h } from '../ui/dom';
import { MainMenu, TitleScreen, type MenuPage } from '../ui/screens/MainMenu';
import type { Team } from '../config/rules';
import type { WeaponId } from '../config/weapons';
import { GameSession, type SessionOptions } from './GameSession';
import { Input } from './Input';
import { loadProfile, saveProfile, type Profile, type Settings } from './Profile';

type Mode = 'title' | 'menu' | 'game';

/** Top-level state machine: Title → Main menu → Match → back to menu. */
export class App {
  readonly renderer: GameRenderer;
  readonly input: Input;
  readonly profile: Profile;
  private ui: HTMLElement;
  private world: World;
  private mode: Mode = 'title';
  private session: GameSession | null = null;
  private menu: MainMenu | null = null;
  private screenEl: HTMLElement | null = null;
  private last = performance.now();
  private menuT = 0;
  private flyPath: CatmullRomCurve3;
  private flyLook: CatmullRomCurve3;
  private showcase = new Group();
  private showChar: CharacterModel;
  private showWeapon: Group | null = null;
  private menuPage: MenuPage = 'play';
  private showTeam: Team = 'T';
  private showWeaponId: WeaponId = 'ravager';

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement, world: World, baked: BakedLighting | null) {
    this.ui = ui;
    this.profile = loadProfile();
    this.renderer = new GameRenderer(canvas);
    this.renderer.baked = baked;
    this.input = new Input(canvas, this.profile.settings.bindings);
    this.world = world;
    this.renderer.quality = this.profile.settings.quality;
    this.renderer.loadMap(this.world, this.profile.settings.quality);
    this.applySettings(this.profile.settings);

    // menu fly-through camera path
    const P = (x: number, y: number, z: number) => new Vector3(x, y, z);
    this.flyPath = new CatmullRomCurve3([P(-1, 2.2, 30), P(-1, 2.4, 0), P(10, 3, -10), P(30, 5, -20), P(50, 6, -2), P(30, 4.5, 16), P(-20, 2.3, 16), P(-45, 2.3, -4), P(-46, 2.4, -26), P(-20, 2.2, -19)], true);
    this.flyLook = new CatmullRomCurve3([P(-1, 1.5, -10), P(5, 1.5, -12), P(30, 1.5, -26), P(45, 1.5, -28), P(40, 1.5, 12), P(0, 1.5, 20), P(-45, 1.5, 12), P(-46, 1.5, -26), P(-30, 1.5, -26), P(-1, 1.5, 10)], true);

    // showcase agent in the lobby
    this.showChar = new CharacterModel(this.profile.looks.T);
    this.showcase.add(this.showChar.root);
    this.showChar.root.position.set(3.4, 0, -30.2);
    this.showChar.root.rotation.y = Math.PI - 0.35;
    this.showcase.visible = false;
    this.renderer.scene.add(this.showcase);

    // URL parameters for automated testing: ?autotest=1&speed=8
    const params = new URLSearchParams(location.search);
    if (params.get('autotest')) {
      this.startGame({ spectate: true, timeScale: Number(params.get('speed') ?? 6), seed: 42, rules: { roundsToWin: 2, halfLength: 1, freezeTime: 2, roundEndDelay: 2 } });
    } else this.showTitle();
    requestAnimationFrame((t) => this.loop(t));
  }

  private applySettings(s: Settings) {
    this.input.bindings = s.bindings;
    sfx.setVolumes(s.masterVolume, s.sfxVolume, s.uiVolume);
    this.renderer.setRenderScale(s.renderScale);
    if (this.world && s.quality !== this.renderer.quality) this.renderer.loadMap(this.world, s.quality);
    saveProfile(this.profile);
  }

  private setScreen(el: HTMLElement | null) {
    this.screenEl?.remove();
    this.screenEl = el;
    if (el) this.ui.append(el);
  }

  private showTitle() {
    this.mode = 'title';
    this.setScreen(new TitleScreen(() => { sfx.resume(); sfx.ui_click(); this.showMenu(); }).el);
  }

  private showMenu() {
    this.mode = 'menu';
    this.menu = new MainMenu(this.profile, {
      start: (spectate) => this.startGame({ spectate }),
      profileChanged: () => { saveProfile(this.profile); this.refreshShowcase(); },
      settingsChanged: (s) => this.applySettings(s),
      pageChanged: (page, ctx) => { this.menuPage = page; this.showTeam = ctx.team; this.showWeaponId = ctx.weapon; this.refreshShowcase(); },
    }, this.input);
    this.setScreen(this.menu.el);
    this.refreshShowcase();
  }

  private refreshShowcase() {
    const show = this.mode === 'menu' && (this.menuPage === 'agents' || this.menuPage === 'loadout');
    this.showcase.visible = show;
    const team = this.menuPage === 'agents' ? this.showTeam : this.profile.match.side === 'CT' ? 'CT' : 'T';
    this.showChar.setLook(this.profile.looks[team]);
    const held = this.menuPage === 'loadout' ? this.showWeaponId : team === 'T' ? 'ravager' : 'sentinel';
    this.showChar.setHeld(`w:${held}:${this.profile.finishes[held as WeaponId] ?? ''}`);
    if (this.showWeapon) this.renderer.camera.remove(this.showWeapon);
    this.showWeapon = null;
    if (this.menuPage === 'loadout') {
      this.showWeapon = weaponModel(this.showWeaponId, this.profile.finishes[this.showWeaponId]);
      this.showWeapon.scale.setScalar(this.showWeaponId === 'knife' || ['k9', 'warden', 'p30', 'judge'].includes(this.showWeaponId) ? 1.6 : 1);
      this.showWeapon.position.set(0.95, -0.05, -1.3);
      this.renderer.camera.add(this.showWeapon);
    }
  }

  startGame(opts: SessionOptions) {
    this.setScreen(null);
    this.menu = null;
    this.showcase.visible = false;
    if (this.showWeapon) { this.renderer.camera.remove(this.showWeapon); this.showWeapon = null; }
    this.mode = 'game';
    sfx.resume();
    this.session = new GameSession(this.renderer, this.input, this.profile, this.ui, () => saveProfile(this.profile), (s) => this.applySettings(s), opts);
    this.session.onExit = () => this.endGame();
    (window as unknown as { __aci: unknown }).__aci = { app: this, session: this.session, match: this.session.match };
    if (!opts.spectate) this.input.requestLock();
  }

  private endGame() {
    this.session?.dispose();
    this.session = null;
    this.input.exitLock();
    this.renderer.showViewModel = false;
    this.showMenu();
  }

  private loop(t: number) {
    requestAnimationFrame((tt) => this.loop(tt));
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    try {
      if (this.mode === 'game' && this.session) this.session.update(dt);
      else this.updateMenuCamera(dt);
      this.renderer.render();
    } catch (err) {
      console.error(err);
      this.showFatal(err);
    }
    this.input.endFrame();
  }

  private fatalShown = false;
  private showFatal(err: unknown) {
    if (this.fatalShown) return;
    this.fatalShown = true;
    this.ui.append(h('div', { class: 'overlay-dim', style: 'z-index:99' }, h('div', { class: 'panel', style: 'padding:24px;max-width:700px' },
      h('h2', null, 'Something went wrong'), h('pre', { style: 'white-space:pre-wrap;font-size:12px' }, String((err as Error)?.stack ?? err)),
      h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Reload'))));
  }

  private updateMenuCamera(dt: number) {
    const cam = this.renderer.camera;
    this.renderer.showViewModel = false;
    cam.fov = verticalFov(this.profile.settings.fov);
    cam.updateProjectionMatrix();
    if (this.mode === 'menu' && this.showcase.visible) {
      // stand the camera in front of the showcase agent
      cam.position.set(2.4, 1.4, -26.6);
      cam.lookAt(0.4, 1.0, -30.2);
      if (this.showWeapon) { this.showWeapon.rotation.y += dt * 0.6; this.showChar.root.visible = false; }
      else this.showChar.root.visible = true;
      this.showChar.update({ speed: 0, maxSpeed: 6, crouch: 0, pitch: Math.sin(performance.now() / 1400) * 0.05, lean: 0, onGround: true, dead: false, deathT: 0, firing: 0, planting: false, dt });
      this.renderer.effects.update(dt, cam, this.renderer.height, cam.fov, performance.now() / 1000);
      return;
    }
    this.menuT = (this.menuT + dt / 90) % 1;
    cam.position.copy(this.flyPath.getPointAt(this.menuT));
    cam.lookAt(this.flyLook.getPointAt(this.menuT));
  }
}
