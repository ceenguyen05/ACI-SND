import { h } from '../dom';
import type { Profile } from '../../app/Profile';
import { saveProfile } from '../../app/Profile';
import { OnlineClient, defaultServerUrl } from '../../net/OnlineClient';
import { roomCapacity, type ClientMessage, type LobbyState, type MatchStart, type RoomOptions } from '../../net/protocol';
import { MATCH_LENGTHS, TEAM_NAMES, type MatchLength } from '../../config/rules';
import { ZDIFF, ZLENGTHS, type ZDifficulty, type ZLength } from '../../config/zombies';
import { levelAt, rankLabel, RANKED_LEVEL } from '../../progression/career';
import { MAP_CHOICES, mapLabel, type SndMapChoice } from '../../sim/maps/index';

function savedServerUrl() {
  try { return localStorage.getItem('aci.online.server') || defaultServerUrl(); }
  catch { return defaultServerUrl(); }
}

export class OnlineMenu {
  readonly el = h('div', { class: 'online-screen' });
  private client: OnlineClient | null = null;
  private lobby: LobbyState | null = null;
  private handedOff = false;
  private disposed = false;
  private busy = false;
  private teamSize = 3;
  private length: MatchLength = 'quick';
  private mode: 'snd' | 'zombies' = 'snd';
  private playlist: 'casual' | 'ranked' = 'casual';
  private zDifficulty: ZDifficulty = 'normal';
  private zLength: ZLength = 'short';
  private map: SndMapChoice;
  private careerDisplay = h('div', { class: 'online-career muted' });
  private status = h('p', { class: 'online-status', role: 'status', 'aria-live': 'polite' });
  private content = h('div', { class: 'online-content' });
  private clock = h('b');
  private clockOffset = 0;
  private timer = setInterval(() => this.updateClock(), 250);
  private serverUrl = savedServerUrl();
  private codeInput = h('input', { class: 'text-input room-code-input', placeholder: '12345', inputmode: 'numeric', maxlength: '5', 'aria-label': 'Private match code' });
  constructor(private profile: Profile, private onBack: () => void, private onStart: (client: OnlineClient, match: MatchStart) => void) {
    this.map = profile.match.map ?? 'random';
    this.el.append(h('div', { class: 'online-panel panel' },
      h('div', { class: 'online-heading' }, h('button', { class: 'btn', onclick: () => this.onBack() }, 'Back'),
        h('div', null, h('span', { class: 'tag' }, 'Search & Destroy · Zombies'), h('h1', null, 'Play online'))), this.careerDisplay, this.content, this.status));
    this.renderHome();
    this.refreshCareer();
  }
  private updateClock() {
    if (!this.lobby) return;
    const remaining = Math.max(0, Math.ceil((this.lobby.startsAt - (Date.now() + this.clockOffset)) / 1000));
    this.clock.textContent = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
  }
  private renderHome() {
    const size = h('select', { class: 'text-input', 'aria-label': 'Online team size', onchange: (e: Event) => { this.teamSize = Number((e.target as HTMLSelectElement).value); } },
      ...[1, 2, 3, 4, 5].map(n => h('option', { value: String(n), selected: n === this.teamSize }, this.mode === 'zombies' ? `${n} survivor${n > 1 ? 's' : ''}` : `${n}v${n}`)));
    const length = h('select', { class: 'text-input', 'aria-label': 'Online match length', onchange: (e: Event) => { this.length = (e.target as HTMLSelectElement).value as MatchLength; } },
      ...Object.entries(MATCH_LENGTHS).map(([id, def]) => h('option', { value: id, selected: id === this.length }, def.label)));
    const server = h('input', { class: 'text-input online-server', value: this.serverUrl, 'aria-label': 'Game server address', placeholder: 'wss://your-game-server/online', onchange: () => {
      this.serverUrl = server.value.trim();
      try { localStorage.setItem('aci.online.server', this.serverUrl); } catch { /* Browser storage may be unavailable. */ }
      this.client?.close(); this.client = null;
    } });
    const mode = h('select', { class: 'text-input', 'aria-label': 'Online game mode', onchange: (e: Event) => { this.mode = (e.target as HTMLSelectElement).value as typeof this.mode; this.playlist = 'casual'; this.renderHome(); } },
      h('option', { value: 'snd', selected: this.mode === 'snd' }, 'Search & Destroy'), h('option', { value: 'zombies', selected: this.mode === 'zombies' }, 'Zombies · Co-op'));
    const playlist = h('select', { class: 'text-input', 'aria-label': 'Online playlist', onchange: (e: Event) => { this.playlist = (e.target as HTMLSelectElement).value as typeof this.playlist; this.renderHome(); } },
      h('option', { value: 'casual', selected: this.playlist === 'casual' }, 'Casual · Humans + bots'), h('option', { value: 'ranked', selected: this.playlist === 'ranked' }, 'Ranked · Full human teams'));
    const difficulty = h('select', { class: 'text-input', 'aria-label': 'Online Zombies difficulty', onchange: (e: Event) => { this.zDifficulty = (e.target as HTMLSelectElement).value as ZDifficulty; } },
      ...Object.entries(ZDIFF).map(([id, d]) => h('option', { value: id, selected: id === this.zDifficulty }, d.label)));
    const map = h('select', { class: 'text-input', 'aria-label': 'Online map', onchange: (e: Event) => {
      this.map = (e.target as HTMLSelectElement).value as SndMapChoice; this.profile.match.map = this.map; saveProfile(this.profile); mapNote.textContent = this.mapBlurb(); } },
      ...MAP_CHOICES.map(c => h('option', { value: c.value, selected: c.value === this.map }, c.label)));
    const mapNote = h('small', { class: 'muted' }, this.mapBlurb());
    const zlength = h('select', { class: 'text-input', 'aria-label': 'Online Zombies length', onchange: (e: Event) => { this.zLength = (e.target as HTMLSelectElement).value as ZLength; } },
      ...Object.entries(ZLENGTHS).map(([id, d]) => h('option', { value: id, selected: id === this.zLength }, d.label)));
    this.content.replaceChildren(
      h('p', { class: 'muted' }, 'Find a public room or invite friends with a private code. Empty spots become bots when the room starts.'),
      h('div', { class: 'online-options' }, h('label', null, 'Game mode', mode), h('label', null, this.mode === 'zombies' ? 'Squad size' : 'Team size', size)),
      h('div', { class: 'online-options' }, this.mode === 'zombies' ? [h('label', null, 'Difficulty', difficulty), h('label', null, 'Survival length', zlength)] : [h('label', null, 'Playlist', playlist), h('label', null, 'Match length', length)]),
      this.mode === 'zombies' ? h('p', { class: 'muted' }, 'Zombies is played on ACI HQ.') : h('div', { class: 'online-options' }, h('label', null, 'Map', map, mapNote)),
      h('button', { class: 'btn', onclick: () => void this.enter() }, 'Load online profile'),
      h('div', { class: 'online-actions' },
        h('button', { class: 'btn primary', onclick: () => void this.enter({ type: 'queue', name: this.profile.name, options: this.options() }) }, 'Play online'),
        h('button', { class: 'btn', onclick: () => void this.enter({ type: 'create', visibility: 'public', name: this.profile.name, options: this.options() }) }, 'Create public match'),
        h('button', { class: 'btn', disabled: this.playlist === 'ranked', title: this.playlist === 'ranked' ? 'Private matches use the Casual playlist' : '', onclick: () => void this.enter({ type: 'create', visibility: 'private', name: this.profile.name, options: this.options() }) }, 'Create private match')),
      h('form', { class: 'online-join', onsubmit: (e: Event) => { e.preventDefault(); const code = this.codeInput.value.trim();
        if (!/^\d{5}$/.test(code)) { this.status.textContent = 'Enter the five-digit room code.'; return; }
        void this.enter({ type: 'join', code, name: this.profile.name });
      } }, h('label', null, 'Private room code', this.codeInput), h('button', { class: 'btn', type: 'submit' }, 'Join private match')),
      h('p', { class: 'online-note muted' }, this.mode === 'zombies' ? 'Co-op survivors fight AI zombies. Empty survivor slots become allied bots after 3 minutes or Play now. Everyone earns XP; Zombies does not affect competitive rank.' :
        this.playlist === 'ranked' ? `Ranked requires online level ${RANKED_LEVEL}, 5 completed online matches and 3v3–5v5. A full human lobby is rated. Play now or the 3-minute bot fallback starts an unrated match.` : 'A full room starts automatically. Otherwise, wait up to 3 minutes or choose Play now. Bot-filled and private games earn XP without changing rank.'),
      h('details', { class: 'online-server-settings' }, h('summary', null, 'Game server connection'), h('label', null, 'Server address', server),
        h('p', { class: 'muted' }, 'Everyone must use the same game server. A custom address is saved on this browser.')));
  }
  private refreshCareer() {
    const c = this.profile.onlineCareer;
    this.careerDisplay.textContent = c ? `Online LV ${levelAt(c.xp).level} · ${rankLabel(c.rank)} · ${c.xp.toLocaleString()} XP · ${c.matches} matches completed` : 'Your online level and rank load when you connect. Offline XP is tracked separately.';
  }
  private mapBlurb() { return (MAP_CHOICES.find(c => c.value === this.map)?.blurb ?? '') + (this.map === 'random' ? ' Public queues match you with players who chose any map.' : ''); }
  private options(): RoomOptions { return { teamSize: this.teamSize, length: this.length, mode: this.mode, playlist: this.playlist, zDifficulty: this.zDifficulty, zLength: this.zLength, map: this.mode === 'zombies' ? 'aci_hq' : this.map }; }
  private async enter(message?: ClientMessage) {
    if (this.busy) return;
    this.busy = true; this.status.textContent = 'Connecting to game server…';
    this.el.classList.add('connecting');
    try {
      if (!this.client?.connected) {
        const client = this.client = new OnlineClient();
        client.onCareer = career => { this.profile.onlineCareer = career; saveProfile(this.profile); this.refreshCareer(); };
        client.onLobby = lobby => {
          this.lobby = lobby; this.clockOffset = lobby.serverNow - Date.now(); this.busy = false; this.el.classList.remove('connecting'); this.renderLobby();
        };
        client.onStart = match => { if (this.disposed) return; this.handedOff = true; this.onStart(client, match); };
        client.onError = message => { this.status.textContent = message; this.busy = false; this.el.classList.remove('connecting'); };
        client.onClose = () => { if (this.disposed) return; this.lobby = null; this.busy = false; this.el.classList.remove('connecting'); this.renderHome(); this.status.textContent = 'Connection lost. Join again to continue playing.'; };
        client.onLeft = () => { this.lobby = null; this.renderHome(); this.status.textContent = 'You left the room.'; };
        await client.connect(this.serverUrl);
      }
      if (this.disposed) { this.client?.close(); return; }
      if (message) this.client.send(message);
      else { this.status.textContent = 'Online profile loaded. Choose a mode to play.'; this.busy = false; this.el.classList.remove('connecting'); }
    } catch (error) {
      this.client?.close(); this.client = null;
      this.status.textContent = (error as Error).message;
      this.busy = false; this.el.classList.remove('connecting');
    }
  }
  private renderLobby() {
    const l = this.lobby!;
    const team = (side: 'T' | 'CT') => {
      const players = l.players.filter(p => p.team === side);
      return h('div', { class: `online-team ${side}` }, h('h3', null, l.options.mode === 'zombies' ? 'Survivors' : TEAM_NAMES[side]),
        ...Array.from({ length: l.options.teamSize }, (_, i) => {
          const p = players[i];
          return h('div', { class: 'online-slot' + (!p ? ' empty' : '') },
            h('span', null, p ? `${p.name} · LV ${p.level ?? 1}` : 'Waiting for player'),
            h('small', null, p ? `${p.id === this.client?.id ? 'You ' : ''}${p.id === l.ownerId ? 'Owner' : ''}` : 'Bot on start'));
        }));
    };
    this.content.replaceChildren(
      h('div', { class: 'online-room-head' }, h('div', null, h('span', { class: 'tag' }, `${l.visibility} room · ${l.options.mode === 'zombies' ? `Zombies · ${l.options.teamSize} survivors` : `${l.options.teamSize}v${l.options.teamSize} · ${l.options.playlist ?? 'casual'}`}`),
        h('p', null, 'Room code ', h('strong', { class: 'online-code' }, l.code))),
        h('button', { class: 'btn', onclick: () => { void navigator.clipboard?.writeText(l.code).then(() => { this.status.textContent = 'Room code copied.'; }).catch(() => { this.status.textContent = `Share code ${l.code}`; }); } }, 'Copy code')),
      h('div', { class: 'online-teams' }, l.options.mode === 'zombies' ? null : team('T'), team('CT')),
      h('div', { class: 'online-countdown' }, h('span', null, 'Starts with bots in '), this.clock),
      h('p', { class: 'muted' }, `${l.players.length}/${roomCapacity(l.options)} players · ${l.options.mode === 'zombies' ? ZLENGTHS[l.options.zLength ?? 'short'].label : MATCH_LENGTHS[l.options.length].label} · `,
        h('span', { class: 'online-map-label' }, l.options.mode === 'zombies' ? 'ACI HQ' : `Map: ${mapLabel(l.options.map)}${(l.options.map ?? 'random') === 'random' ? ' (picked at start)' : ''}`)),
      h('div', { class: 'online-actions' }, l.ownerId === this.client?.id ? h('button', { class: 'btn primary', onclick: () => this.client?.send({ type: 'start' }) }, l.ranked ? 'Play now (unrated with bots)' : 'Play now') : h('span', { class: 'muted' }, 'The owner can start the match now.'),
        h('button', { class: 'btn', onclick: () => this.client?.send({ type: 'leave' }) }, 'Leave room')));
    this.status.textContent = l.visibility === 'private' ? 'Share the code with friends so they can join this room.' : 'Searching for more players. Other players using Play online can join this room.';
    this.updateClock();
  }
  dispose() { this.disposed = true; clearInterval(this.timer); if (!this.handedOff) this.client?.close(); }
}
