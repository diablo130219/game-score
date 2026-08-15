
/* V77 — Static URL safety fix */
(function(){
  try{
    window.GS_ONLINE_CONFIG = window.GS_ONLINE_CONFIG || {};
    const oldUrl = "https://game-score-go9s.onrender.com";
    const staticUrl = "https://game-score-static.onrender.com";
    const current = String(window.GS_ONLINE_CONFIG.APP_PUBLIC_URL || "").trim();
    if(!current || current === oldUrl){
      window.GS_ONLINE_CONFIG.APP_PUBLIC_URL = staticUrl;
    }
  }catch(e){}
})();


/* =========================================================
   v56 — ROBUST PERSISTENCE CORE
   Primary + backup + session shadow, recovery, metadata.
   ========================================================= */
const GS_LAST_ACTIVE_KEY="gs:last-active-game-v1";
const GS_META_PREFIX="gs:game-meta-v1:";

function gsSafeParse(raw){
  if(!raw)return null;
  try{
    const x=JSON.parse(raw);
    return x && typeof x==="object" ? x : null;
  }catch(e){return null}
}
function gsStorageMeta(game, data, active){
  const players=Array.isArray(data?.players)?data.players:[];
  const rounds=Array.isArray(data?.rounds)?data.rounds:[];
  const meta={
    game,
    updatedAt:Date.now(),
    players:players.length,
    playerNames:players.slice(0,6),
    rounds:rounds.length,
    active:!!active
  };
  try{localStorage.setItem(GS_META_PREFIX+game,JSON.stringify(meta))}catch(e){}
  if(active){
    try{localStorage.setItem(GS_LAST_ACTIVE_KEY,game)}catch(e){}
  }else{
    try{
      if(localStorage.getItem(GS_LAST_ACTIVE_KEY)===game)localStorage.removeItem(GS_LAST_ACTIVE_KEY);
    }catch(e){}
  }
  return meta;
}
function gsRobustSave(key,data,game,active=true){
  const raw=JSON.stringify(data);
  try{
    const current=localStorage.getItem(key);
    if(current && gsSafeParse(current))localStorage.setItem(key+"__backup",current);
    localStorage.setItem(key,raw);
    localStorage.setItem(key+"__lastgood",raw);
  }catch(e){}
  try{sessionStorage.setItem(key+"__shadow",raw)}catch(e){}
  gsStorageMeta(game,data,active);
}
function gsRobustLoad(key,fallback){
  let primary=null;
  try{primary=localStorage.getItem(key)}catch(e){}
  const p=gsSafeParse(primary);
  if(p && Array.isArray(p.players) && Array.isArray(p.rounds)){
    return {...fallback,...p};
  }

  const candidates=[];
  try{
    candidates.push(localStorage.getItem(key+"__lastgood"));
    candidates.push(localStorage.getItem(key+"__backup"));
  }catch(e){}
  try{candidates.push(sessionStorage.getItem(key+"__shadow"))}catch(e){}
  for(const raw of candidates){
    const x=gsSafeParse(raw);
    if(x && Array.isArray(x.players) && Array.isArray(x.rounds)){
      try{localStorage.setItem(key,JSON.stringify(x))}catch(e){}
      return {...fallback,...x};
    }
  }
  return {...fallback};
}
function gsTouchGame(game,data,active){
  gsStorageMeta(game,data,active);
}


const KEY="flip7-score-v5";

/* =========================================================
   V101 — SUONI PIÙ PRESENTI (+40%)
   Generati via Web Audio: nessun file esterno.
   ========================================================= */
const GS_SOUND_KEY="gs:sounds-enabled-v1";
let gsAudioCtx=null;

function gsSoundsEnabled(){
  try{
    const v=localStorage.getItem(GS_SOUND_KEY);
    return v===null ? true : v==="1";
  }catch(e){return true}
}
function gsSetSoundsEnabled(enabled){
  try{localStorage.setItem(GS_SOUND_KEY,enabled?"1":"0")}catch(e){}
  gsUpdateSoundToggle();
  if(enabled){
    gsUnlockAudio();
    setTimeout(()=>gsPlaySound("toggle"),40);
  }
}
function gsUpdateSoundToggle(){
  const btn=document.getElementById("gsSoundToggle");
  const icon=document.getElementById("gsSoundToggleIcon");
  if(!btn||!icon)return;
  const on=gsSoundsEnabled();
  icon.textContent=on?"🔊":"🔇";
  btn.classList.toggle("muted",!on);
  btn.setAttribute("aria-label",on?"Disattiva i suoni":"Attiva i suoni");
  const label=btn.querySelector("small");
  if(label)label.textContent=on?"SUONI":"MUTO";
}
function gsUnlockAudio(){
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return null;
    if(!gsAudioCtx)gsAudioCtx=new AC();
    if(gsAudioCtx.state==="suspended")gsAudioCtx.resume().catch(()=>{});
    return gsAudioCtx;
  }catch(e){return null}
}
let gsMasterAudio=null;
function gsAudioDestination(ctx){
  if(gsMasterAudio && gsMasterAudio.ctx===ctx)return gsMasterAudio.node;
  const comp=ctx.createDynamicsCompressor();
  comp.threshold.value=-22;
  comp.knee.value=18;
  comp.ratio.value=5;
  comp.attack.value=.003;
  comp.release.value=.18;
  const master=ctx.createGain();
  master.gain.value=2.8;
  comp.connect(master); master.connect(ctx.destination);
  gsMasterAudio={ctx,node:comp};
  return comp;
}
function gsTone(ctx,freq,start,duration,gain=.16,type="sine"){
  const osc=ctx.createOscillator();
  const vol=ctx.createGain();
  osc.type=type;
  osc.frequency.setValueAtTime(freq,start);
  vol.gain.setValueAtTime(0.0001,start);
  vol.gain.exponentialRampToValueAtTime(Math.max(.001,gain),start+.012);
  vol.gain.exponentialRampToValueAtTime(.0001,start+duration);
  osc.connect(vol); vol.connect(gsAudioDestination(ctx));
  osc.start(start); osc.stop(start+duration+.025);
}
function gsPlaySound(kind){
  if(!gsSoundsEnabled())return;
  const ctx=gsUnlockAudio();
  if(!ctx)return;
  const play=()=>{
    const t=ctx.currentTime+.015;
    try{
      if(kind==="round"){
        gsTone(ctx,520,t,.22,.15,"square");
        gsTone(ctx,700,t+.10,.25,.13,"triangle");
      }else if(kind==="rank"){
        gsTone(ctx,440,t,.20,.12,"triangle");
        gsTone(ctx,610,t+.11,.23,.14,"triangle");
        gsTone(ctx,820,t+.23,.27,.12,"triangle");
      }else if(kind==="win"){
        gsTone(ctx,523.25,t,.42,.18,"triangle");
        gsTone(ctx,659.25,t+.14,.46,.19,"triangle");
        gsTone(ctx,783.99,t+.30,.52,.20,"triangle");
        gsTone(ctx,1046.5,t+.50,.65,.18,"square");
        gsTone(ctx,1318.5,t+.72,.62,.14,"sine");
      }else if(kind==="toggle"){
        gsTone(ctx,660,t,.16,.12,"triangle");
      }
    }catch(e){}
  };
  if(ctx.state==="suspended"){
    ctx.resume().then(play).catch(()=>{});
  }else play();
}

document.addEventListener("pointerdown",()=>gsUnlockAudio(),{passive:true});
setTimeout(()=>{
  gsUpdateSoundToggle();
  document.getElementById("gsSoundToggle")?.addEventListener("click",()=>{
    gsSetSoundsEnabled(!gsSoundsEnabled());
  });
},80);


/* V102 — GIOCATORE DI TURNO */
function gsNormTurn(i,n){if(!n)return 0;i=Number(i||0)%n;return i<0?i+n:i}
function gsEnsureTurn(s){
  if(!s)return 0;
  const n=(s.players||[]).length;
  if(!Number.isInteger(s.turnIndex))s.turnIndex=0;
  s.turnIndex=gsNormTurn(s.turnIndex,n);
  return s.turnIndex;
}
function gsTurnName(s){
  const p=s?.players||[];
  return p.length?String(p[gsEnsureTurn(s)]??"—"):"—";
}
function gsMoveTurn(s,step){
  const n=(s?.players||[]).length;
  if(!n){if(s)s.turnIndex=0;return}
  s.turnIndex=gsNormTurn(gsEnsureTurn(s)+step,n);
}
function gsResetTurn(s){if(s)s.turnIndex=0}

const HALL_KEY="flip7-score-hall-v1";

const themes=[
  {c:"#ffd20a",asset:"assets/freeze.png",fallback:"FREEZE!"},
  {c:"#a84cff",asset:"assets/flip_three.png",fallback:"FLIP THREE!"},
  {c:"#159dff",asset:"assets/second_chance.png",fallback:"SECOND CHANCE!"},
  {c:"#35d44f",asset:"assets/num_12.png",fallback:"12"},
  {c:"#ff8d19",asset:null,fallback:"11"},
  {c:"#28d6c4",asset:null,fallback:"10"},
  {c:"#ff304f",asset:"assets/num_9.png",fallback:"9"},
  {c:"#ef4cc8",asset:null,fallback:"8"},
  {c:"#7f8cff",asset:null,fallback:"7"},
  {c:"#8fc93a",asset:null,fallback:"6"},
  {c:"#ff6b35",asset:null,fallback:"5"},
  {c:"#e9bd43",asset:null,fallback:"4"},
  {c:"#43c8ff",asset:null,fallback:"3"},
  {c:"#ff6eb4",asset:null,fallback:"2"},
  {c:"#b9c1ce",asset:null,fallback:"1"},
  {c:"#8b96a8",asset:null,fallback:"0"}
];

let state={players:[],rounds:[],target:200,gameId:null,resultRecorded:false,turnIndex:0};
let setupCount=3;

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
const normalizeName=s=>String(s).trim().replace(/\s+/g," ").toLocaleLowerCase("it");

function save(){
  gsRobustSave(KEY,state,"flip7",!!state.players.length && !state.resultRecorded);
}
function load(){
  state=gsRobustLoad(KEY,state);
  if(state.resultRecorded===undefined)state.resultRecorded=false;
}

/* =========================================================
   V90 — TROFEO GENERALE CON VITTORIE DEL LEADER STORICO
   ========================================================= */
function gsHallMaxWinsFromPlayers(players){
  if(!players)return 0;
  const list=Array.isArray(players)?players:Object.values(players);
  return list.reduce((max,p)=>Math.max(max,Number(p?.wins||0)),0);
}

function gsGlobalHistoricalLeaderWins(){
  // "Generale" = somma le vittorie della stessa persona nei tre giochi.
  // In questo modo il numero sulla Home rappresenta davvero il leader
  // storico di tutto GAME SCORE, non di un singolo gioco.
  const totals={};
  const add=(players)=>{
    const list=Array.isArray(players)?players:Object.values(players||{});
    list.forEach(p=>{
      const name=String(p?.name||"").trim();
      if(!name)return;
      const key=name.toLocaleLowerCase("it");
      totals[key]=(totals[key]||0)+Number(p?.wins||0);
    });
  };
  try{ add(loadHall()?.players); }catch(e){}
  try{ add(seaHallLoad()?.players); }catch(e){}
  try{ add(six39HallLoad()?.players); }catch(e){}
  return Object.values(totals).reduce((m,v)=>Math.max(m,Number(v||0)),0);
}

function gsSetTrophyCount(id,value){
  const el=document.getElementById(id);
  if(!el)return;
  const n=Math.max(0,Number(value||0));
  el.textContent=String(n);
  el.classList.toggle("is-zero",n===0);
  el.parentElement?.classList.toggle("has-history",n>0);
}

function gsUpdateHistoricalTrophyButtons(){
  try{
    gsSetTrophyCount("flipHallLeaderWins",gsHallMaxWinsFromPlayers(loadHall()?.players));
  }catch(e){}
  try{
    gsSetTrophyCount("seaHallLeaderWins",gsHallMaxWinsFromPlayers(seaHallLoad()?.players));
  }catch(e){}
  try{
    gsSetTrophyCount("six39HallLeaderWins",gsHallMaxWinsFromPlayers(six39HallLoad()?.players));
  }catch(e){}
  try{
    gsSetTrophyCount("homeHallLeaderWins",gsGlobalHistoricalLeaderWins());
  }catch(e){}
}

function loadHall(){
  try{
    const raw=localStorage.getItem(HALL_KEY);
    return raw?JSON.parse(raw):{players:{},totalGames:0};
  }catch(e){return {players:{},totalGames:0}}
}
function saveHall(h){localStorage.setItem(HALL_KEY,JSON.stringify(h));setTimeout(gsUpdateHistoricalTrophyButtons,0)}
function totals(){return state.players.map((_,i)=>state.rounds.reduce((a,r)=>a+(Number(r[i])||0),0))}
function lastRound(){return state.rounds.length?state.rounds[state.rounds.length-1]:state.players.map(()=>0)}

let setupDraftNames=[];

function captureSetupNames(){
  const inputs=$$(".setup-name");
  if(inputs.length) setupDraftNames=inputs.map(x=>x.value);
}

function renderSetupPlayers(){
  $("#setupPlayers").innerHTML="";
  for(let i=0;i<setupCount;i++){
    const value=setupDraftNames[i]||"";
    const row=document.createElement("div");
    row.className="setup-row";
    row.innerHTML=`<div class="player-index">${i+1}</div><input class="input setup-name" placeholder="Nome giocatore ${i+1}" autocomplete="off" value="${esc(value)}">`;
    $("#setupPlayers").appendChild(row);
  }
  $("#playerCount").textContent=setupCount;
}

function showSetup(){
  $("#setup").classList.remove("hidden");
  $("#game").classList.add("hidden");
  renderSetupPlayers();
}

function changeCount(delta){
  captureSetupNames();
  setupCount=Math.max(3,Math.min(18,setupCount+delta));
  if(setupDraftNames.length>setupCount) setupDraftNames=setupDraftNames.slice(0,setupCount);
  renderSetupPlayers();
}

function startGame(){
  const names=$$(".setup-name").map(x=>x.value.trim());
  if(names.some(n=>!n)){alert("Inserisci il nome di tutti i giocatori.");return}
  const normalized=names.map(normalizeName);
  if(new Set(normalized).size!==normalized.length){alert("I nomi dei giocatori devono essere diversi.");return}
  const editingExisting=state.players.length>0 && state.rounds.length>=0;
  if(editingExisting){
    const oldPlayers=[...state.players];
    const oldRounds=state.rounds.map(r=>[...r]);
    const oldMap=new Map(oldPlayers.map((n,i)=>[normalizeName(n),i]));
    const remappedRounds=oldRounds.map(r=>names.map(n=>{
      const oldIndex=oldMap.get(normalizeName(n));
      return oldIndex===undefined?0:(Number(r[oldIndex])||0);
    }));
    state.players=names;
    state.rounds=remappedRounds;
    state.resultRecorded=false;
  }else{
    state={
      players:names,rounds:[],target:200,
      gameId:`g-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      resultRecorded:false
    };
  }
  setupDraftNames=[];
  save();render();
}

function statusFor(i,ts){
  if(!state.rounds.length)return "";
  const max=Math.max(...ts),min=Math.min(...ts);
  if(max===min)return "";
  if(ts[i]===max)return "IN TESTA";
  if(ts[i]===min)return "ULTIMO";
  return "";
}

function winnerInfo(ts){
  if(!state.rounds.length || !ts.some(v=>v>=state.target))return null;
  const max=Math.max(...ts);
  return {score:max,names:state.players.filter((_,i)=>ts[i]===max)};
}

function recordResultIfNeeded(winner){
  if(!winner || state.resultRecorded)return;
  const hall=loadHall();
  hall.players=hall.players||{};
  hall.totalGames=(hall.totalGames||0)+1;

  state.players.forEach(name=>{
    const key=normalizeName(name);
    if(!hall.players[key]){
      hall.players[key]={name:name.trim(),wins:0,games:0,lastWin:null,bestScore:0,podiums:0};
    }else{
      hall.players[key].name=name.trim();
    }
    hall.players[key].games=(hall.players[key].games||0)+1;
    const playerIndex=state.players.findIndex(n=>normalizeName(n)===key);
    const finalScore=totals()[playerIndex]||0;
    hall.players[key].bestScore=Math.max(hall.players[key].bestScore||0,finalScore);
  });

  winner.names.forEach(name=>{
    const key=normalizeName(name);
    hall.players[key].wins=(hall.players[key].wins||0)+1;
    hall.players[key].lastWin=new Date().toISOString();
  });

  // Podi: per i dati storici precedenti almeno ogni vittoria vale già un podio.
  const flipFinalTotals=totals();
  const flipFinalOrder=state.players.map((name,i)=>({name,i,total:flipFinalTotals[i]||0}))
    .sort((a,b)=>b.total-a.total || a.i-b.i);
  flipFinalOrder.slice(0,3).forEach(x=>{
    const key=normalizeName(x.name),p=hall.players[key];
    p.podiums=Math.max(Number(p.podiums||0),Number(p.wins||0)-(winner.names.some(n=>normalizeName(n)===key)?1:0))+1;
  });
  Object.values(hall.players).forEach(p=>{p.podiums=Math.max(Number(p.podiums||0),Number(p.wins||0))});

  saveHall(hall);
  state.resultRecorded=true;
  save();
}

function cardMarkup(i){
  const t=themes[i%themes.length];
  return `<div class="flip7-logo-tile" style="--tile:${t.c}" aria-label="Flip 7">
    <span class="flip7-word">FLIP</span><span class="flip7-seven">7</span>
  </div>`;
}


function showWinScreen(w){
  const ts=totals();
  const order=state.players.map((name,i)=>({name,i,total:ts[i]}))
    .sort((a,b)=>b.total-a.total || a.i-b.i);

  const winName=w.names.length===1 ? w.names[0] : w.names.join(" & ");
  $("#winTitle").textContent=`${winName.toUpperCase()} ${w.names.length===1?"VINCE!":"VINCONO!"}`;
  $("#winScore").textContent=w.score;

  $("#finalRanking").innerHTML=order.map((p,rank)=>{
    const t=themes[p.i%themes.length];
    const isWinner=w.names.includes(p.name);
    const pos=rank===0?"🥇":rank===1?"🥈":rank===2?"🥉":`${rank+1}°`;
    return `<div class="final-row ${isWinner?"winner-row":""}" style="--fc:${t.c}">
      <div class="final-pos">${pos}</div>
      <div class="final-name">${esc(p.name)}</div>
      <div class="final-points"><b>${p.total}</b><span>punti</span></div>
    </div>`;
  }).join("");

  gsShowPerfectWin("winScreen","flip");
  gsPlaySound("win");
  // V103: lascia montare e vedere l'animazione prima di azzerare la partita attiva.
  setTimeout(()=>gsAutoArchiveCompletedGame("flip"),1800);
}

function hideWinScreen(){
  $("#winScreen").classList.add("hidden");
  $("#winScreen").classList.remove("showing");
}

function rematch(){
  previousRankingSnapshot=null;
  state.rounds=[];
  state.gameId=`g-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  state.resultRecorded=false;
  save();
  hideWinScreen();
  render();
  window.scrollTo({top:0,behavior:"smooth"});
}


let previousRankingSnapshot=null;
let animateNextRanking=false;

function rankingSnapshot(){
  const ts=totals();
  return state.players.map((name,i)=>({name,i,total:ts[i]}))
    .sort((a,b)=>b.total-a.total || a.i-b.i);
}

function captureRankingPositions(){
  const map=new Map();
  $$(".player-row").forEach(el=>{
    const key=el.dataset.playerKey;
    if(key) map.set(key,el.getBoundingClientRect());
  });
  return map;
}

function showRankToast(message){
  const toast=$("#rankToast");
  if(!toast || !message)return;
  toast.textContent=message;
  toast.classList.remove("show");
  void toast.offsetWidth;
  toast.classList.add("show");
}

function animateRankingTransition(beforeRects,beforeSnapshot){
  requestAnimationFrame(()=>{
    const afterRows=$$(".player-row");
    const afterSnapshot=rankingSnapshot();

    afterRows.forEach(el=>{
      const key=el.dataset.playerKey;
      const before=beforeRects.get(key);
      if(!before)return;
      const after=el.getBoundingClientRect();
      const dy=before.top-after.top;
      if(Math.abs(dy)>2){
        el.style.transition="none";
        el.style.transform=`translateY(${dy}px)`;
        void el.offsetWidth;
        el.classList.add("rank-moving");
        el.style.transition="";
        requestAnimationFrame(()=>{el.style.transform="translateY(0)"});
        setTimeout(()=>{
          el.classList.remove("rank-moving");
          el.classList.add("rank-settle");
          setTimeout(()=>el.classList.remove("rank-settle"),420);
        },620);
      }
    });

    const beforePos=new Map((beforeSnapshot||[]).map((p,idx)=>[p.i,idx]));
    const afterPos=new Map(afterSnapshot.map((p,idx)=>[p.i,idx]));
    const climbers=afterSnapshot.filter(p=>{
      const b=beforePos.get(p.i),a=afterPos.get(p.i);
      return Number.isInteger(b)&&Number.isInteger(a)&&a<b;
    });

    if(climbers.length){
      gsPlaySound("rank");
      const best=climbers.sort((a,b)=>(beforePos.get(a.i)-afterPos.get(a.i))-(beforePos.get(b.i)-afterPos.get(b.i)))[climbers.length-1];
      const oldPos=beforePos.get(best.i)+1;
      const newPos=afterPos.get(best.i)+1;
      showRankToast(`⬆ ${best.name} sale dal ${oldPos}° al ${newPos}° posto`);
    }

    if(afterSnapshot[0] && (!beforeSnapshot || !beforeSnapshot[0] || afterSnapshot[0].i!==beforeSnapshot[0].i)){
      const leaderRow=document.querySelector(`.player-row[data-player-key="${afterSnapshot[0].i}"]`);
      if(leaderRow){
        const crown=leaderRow.querySelector(".crown");
        const status=leaderRow.querySelector(".status");
        if(crown){crown.classList.add("crown-in");setTimeout(()=>crown.classList.remove("crown-in"),700)}
        if(status){status.classList.add("status-in");setTimeout(()=>status.classList.remove("status-in"),500)}
      }
    }

    afterRows.forEach(row=>{
      const total=row.querySelector(".total");
      const delta=row.querySelector(".delta");
      if(total){total.classList.add("score-bump");setTimeout(()=>total.classList.remove("score-bump"),560)}
      if(delta){delta.classList.add("delta-pop");setTimeout(()=>delta.classList.remove("delta-pop"),520)}
    });

    previousRankingSnapshot=afterSnapshot;
  });
}

function render(){
  const shouldAnimate=animateNextRanking && !$("#game").classList.contains("hidden");
  const beforeRects=shouldAnimate?captureRankingPositions():new Map();
  const beforeSnapshot=shouldAnimate?(previousRankingSnapshot||rankingSnapshot()):null;

  if(!state.players.length){showSetup();return}
  $("#setup").classList.add("hidden");
  $("#game").classList.remove("hidden");

  const ts=totals(),lr=lastRound();
  $("#roundNumber").textContent=state.rounds.length+1;
  if($("#flipTurnName"))$("#flipTurnName").textContent=gsTurnName(state);
  $("#modalRound").textContent=state.rounds.length+1;

  const order=state.players.map((name,i)=>({name,i,total:ts[i]}))
    .sort((a,b)=>b.total-a.total || a.i-b.i);

  const maxScore=Math.max(...ts);
  const progress=Math.max(0,Math.min(100,(maxScore/state.target)*100));
  $("#gameProgressFill").style.width=`${progress}%`;
  $("#gameProgressLabel").textContent=maxScore===0
    ? "Partita appena iniziata"
    : `${order[0].name} è al ${Math.round(progress)}% del traguardo`;

  $("#leaderboard").innerHTML=order.map((p,pos)=>{
    const t=themes[p.i%themes.length];
    const c=t.c;
    const sameScore=order.every(x=>x.total===order[0].total);
    const isLeader=pos===0 && !sameScore;
    const isLast=pos===order.length-1 && order.length>1 && !sameScore;
    const status=isLeader?"IN TESTA":(isLast?"ULTIMO":"");

    return `<article class="player-row flip53-player-row ${isLeader?"leader":""}"
      data-player-key="${p.i}" style="--c:${c}">
      ${status?`<span class="flip53-status ${isLast?"last":""}">${status}</span>`:""}

      <div class="place flip53-place">${pos+1}°</div>

      <div class="flip53-card-stage">
        <div class="flip53-back-card back-one"></div>
        <div class="flip53-back-card back-two"></div>
        <div class="flip53-front-wrap">${cardMarkup(p.i)}</div>
      </div>

      <div class="player-main flip53-player-main">
        <div class="player-name">${esc(p.name)}</div>
        <div class="flip53-last-line">
          <span>Ultimo round</span>
          <b class="delta">+${Number(lr[p.i]||0)}</b>
        </div>
      </div>

      <div class="score-side flip53-score-side">
        <div class="total">${p.total}</div>
        <div class="missing">Mancano <b>${Math.max(0,state.target-p.total)}</b></div>
      </div>
    </article>`;
  }).join("");

  $("#roundInputs").innerHTML=state.players.map((n,i)=>{
    const t=themes[i%themes.length];
    return `<div class="round-input-row flip98-round-row" style="--rc:${t.c}">
      <div class="player-mini flip98-player-mini">
        <div class="player-mini-icon flip98-mini-card">${esc(t.fallback)}</div>
        <div class="flip98-player-copy">
          <strong>${esc(n)}</strong>
          <div class="player-last">Totale attuale: ${ts[i]}</div>
        </div>
      </div>
      <input class="input round-score flip98-round-score" type="number" min="0" inputmode="numeric" value="" data-i="${i}">
    </div>`;
  }).join("");
  bindRoundInputTotals();

  const w=winnerInfo(ts);
  if(w){
    const wasRecorded=state.resultRecorded;
    recordResultIfNeeded(w);
    $("#winner").classList.remove("hidden");
    $("#winner").innerHTML=`
      🏆 <strong>${esc(w.names.join(" e "))} ${w.names.length===1?"vince!":"vincono!"}</strong>
      <br>Punteggio finale: ${w.score}
      <div class="winner-actions">
        <button class="btn dark" onclick="openModal('hallModal');renderHall()">🏆 Classifica generale</button>
        <button class="btn yellow" onclick="rematch()">↻ Rivincita</button>
      </div>`;
    if(!wasRecorded){
      setTimeout(()=>showWinScreen(w),180);
    }
  }else{
    $("#winner").classList.add("hidden");
  }

  renderHistory();

  if(shouldAnimate){
    animateNextRanking=false;
    animateRankingTransition(beforeRects,beforeSnapshot);
  }else{
    previousRankingSnapshot=rankingSnapshot();
  }
}


function bindRoundInputTotals(){
  const inputs=$$(".round-score");
  const update=()=>{
    const total=inputs.reduce((sum,el)=>{
      const n=parseInt(el.value,10);
      return sum+(Number.isFinite(n)&&n>=0?n:0);
    },0);
    const out=$("#roundEnteredTotal");
    if(out) out.textContent=total;
  };
  inputs.forEach(el=>el.addEventListener("input",update));
  update();
}

function editHistoryRound(roundIndex){
  if(state.resultRecorded){
    alert("La partita è già stata registrata nella classifica generale.");
    return;
  }
  const existing=state.rounds[roundIndex];
  $("#modalRound").textContent=roundIndex+1;
  const tsBefore=state.players.map((_,i)=>state.rounds.slice(0,roundIndex).reduce((a,r)=>a+(Number(r[i])||0),0));
  $("#roundInputs").innerHTML=state.players.map((n,i)=>{
    const t=themes[i%themes.length];
    return `<div class="round-input-row flip98-round-row" style="--rc:${t.c}">
      <div class="player-mini flip98-player-mini">
        <div class="player-mini-icon flip98-mini-card">${esc(t.fallback)}</div>
        <div class="flip98-player-copy">
          <strong>${esc(n)}</strong>
          <div class="player-last">Totale prima del round: ${tsBefore[i]}</div>
        </div>
      </div>
      <input class="input round-score flip98-round-score" type="number" min="0" inputmode="numeric" value="${existing[i]||0}" data-i="${i}">
    </div>`;
  }).join("");
  bindRoundInputTotals();
  $("#saveRound").dataset.editRound=String(roundIndex);
  openModal("roundModal");
}

function gsScoreEntryBodyState(id,isOpen){
  if(!["roundModal","seaRoundModal","six39RoundModal"].includes(id))return;
  document.body.classList.toggle("gs-score-entry-open",!!isOpen);
}
function openModal(id){
  $("#"+id).classList.remove("hidden");
  gsScoreEntryBodyState(id,true);
}
function closeModal(id){
  $("#"+id).classList.add("hidden");
  gsScoreEntryBodyState(id,false);
}


function showRoundSavedFeedback(roundNumber){
  const toast=$("#roundSaveToast");
  if(toast){
    toast.textContent=`✓ Round ${roundNumber} registrato`;
    toast.classList.remove("show");
    void toast.offsetWidth;
    toast.classList.add("show");
  }

  const cta=$("#openRound");
  if(cta){
    cta.classList.remove("round-saved-flash");
    void cta.offsetWidth;
    cta.classList.add("round-saved-flash");
    setTimeout(()=>cta.classList.remove("round-saved-flash"),650);
  }

  try{
    if(navigator.vibrate) navigator.vibrate([35,25,55]);
  }catch(e){}
}

function closeRoundModalAnimated(callback){
  const modal=$("#roundModal");
  if(!modal){ if(callback)callback(); return; }
  modal.classList.add("closing");
  setTimeout(()=>{
    modal.classList.remove("closing");
    modal.classList.add("hidden");
    gsScoreEntryBodyState("roundModal",false);
    if(callback)callback();
  },280);
}

function saveRound(){
  const vals=$$(".round-score").map(el=>{
    const n=parseInt(el.value,10);
    return Number.isFinite(n)&&n>=0?n:0;
  });

  const editIndex=$("#saveRound").dataset.editRound;
  const isEdit=editIndex!==undefined && editIndex!=="";
  let roundNumber;

  if(isEdit){
    roundNumber=Number(editIndex)+1;
    state.rounds[Number(editIndex)]=vals;
    delete $("#saveRound").dataset.editRound;
  }else{
    state.rounds.push(vals);
    gsMoveTurn(state,1);
    roundNumber=state.rounds.length;
  }

  save();
  gsPlaySound("round");

  closeRoundModalAnimated(()=>{
    animateNextRanking=true;
    render();

    if(isEdit){
      const toast=$("#roundSaveToast");
      if(toast){
        toast.textContent=`✓ Round ${roundNumber} aggiornato`;
        toast.classList.remove("show");
        void toast.offsetWidth;
        toast.classList.add("show");
      }
      try{
        if(navigator.vibrate) navigator.vibrate([25,20,40]);
      }catch(e){}
    }else{
      showRoundSavedFeedback(roundNumber);
    }
  });
}

function deleteCurrentGame(){
  if(!state.players.length && !state.rounds.length){
    showHome();
    return;
  }

  const ok=confirm(
    "Vuoi eliminare completamente questa partita?\n\n" +
    "Verranno cancellati i giocatori, tutti i round e tutti i punteggi della partita corrente. " +
    "L'operazione non può essere annullata."
  );
  if(!ok)return;

  state={players:[],rounds:[],target:200,gameId:null,resultRecorded:false,turnIndex:0};
  previousRankingSnapshot=null;
  animateNextRanking=false;
  save();

  try{
    if(navigator.vibrate) navigator.vibrate([45,35,70]);
  }catch(e){}

  hideWinScreen();
  showHome();
}

function undo(){
  if(!state.rounds.length)return;
  if(confirm("Annullare l'ultimo round?")){
    if(state.resultRecorded){
      alert("La partita è già stata registrata nella classifica generale. Per correggere il risultato, azzera la classifica generale oppure avvia una nuova partita.");
      return;
    }
    state.rounds.pop();save();render();
  }
}

function editPlayers(){
  if(state.resultRecorded){
    alert("La partita è già terminata e registrata nella classifica generale. Avvia una nuova partita per cambiare i giocatori.");
    return;
  }
  setupCount=state.players.length;
  setupDraftNames=[...state.players];
  $("#game").classList.add("hidden");
  $("#setup").classList.remove("hidden");
  renderSetupPlayers();
  window.scrollTo({top:0,behavior:"smooth"});
}

function newGame(){
  previousRankingSnapshot=null;
  state={players:[],rounds:[],target:200,gameId:null,resultRecorded:false,turnIndex:0};
  setupCount=3;
  setupDraftNames=[];
  save();
  render();
}


function deleteHistoryRound(roundIndex){
  if(state.resultRecorded){
    alert("La partita è già terminata e registrata nella classifica generale. Non puoi eliminare round dopo la registrazione del risultato.");
    return;
  }

  const label=`Round ${roundIndex+1}`;
  if(!confirm(`Eliminare completamente ${label}? I totali verranno ricalcolati automaticamente.`)){
    return;
  }

  state.rounds.splice(roundIndex,1);
  save();
  animateNextRanking=true;
  render();
  renderHistory();

  try{
    if(navigator.vibrate) navigator.vibrate(35);
  }catch(e){}
}

function renderHistory(){
  if(!state.rounds.length){
    $("#historyList").innerHTML='<p class="helper">Ancora nessun round registrato.</p>';
    return;
  }
  $("#historyList").innerHTML=state.rounds.map((r,ri)=>`
    <div class="history-card">
      <div class="history-card-head">
        <strong>Round ${ri+1}</strong>
        <div class="history-card-head-actions">
          <button class="history-edit" onclick="editHistoryRound(${ri})">Modifica</button>
          <button class="history-delete" onclick="deleteHistoryRound(${ri})">Elimina</button>
        </div>
      </div>
      <div class="history-player-grid">
        ${r.map((v,i)=>`<div class="history-player"><span>${esc(state.players[i])}</span><b>+${v}</b></div>`).join("")}
      </div>
    </div>`).reverse().join("");
}

function formatItalianDate(iso){
  if(!iso)return "Nessuna vittoria registrata";
  try{
    return new Intl.DateTimeFormat("it-IT",{
      day:"numeric",month:"long",year:"numeric"
    }).format(new Date(iso));
  }catch(e){
    return "Data non disponibile";
  }
}


/* =========================================================
   V99 — STATISTICHE AVANZATE HALL OF FAME
   ========================================================= */
function gsPodiums(p){
  return Math.max(Number(p?.podiums||0),Number(p?.wins||0));
}
function gsTopGameForPlayer(name){
  const key=String(name||"").trim().toLocaleLowerCase("it");
  const games=[];
  try{
    const p=(loadHall()?.players||{})[key];
    if(p)games.push({name:"Flip 7",wins:Number(p.wins||0),games:Number(p.games||0)});
  }catch(e){}
  try{
    const p=(seaHallLoad()?.players||{})[key];
    if(p)games.push({name:"Sea Salt & Paper",wins:Number(p.wins||0),games:Number(p.games||0)});
  }catch(e){}
  try{
    const p=(six39HallLoad()?.players||{})[key];
    if(p)games.push({name:"6… Le prendi!",wins:Number(p.wins||0),games:Number(p.games||0)});
  }catch(e){}
  if(!games.length)return "—";
  games.sort((a,b)=>b.wins-a.wins || b.games-a.games || a.name.localeCompare(b.name,"it"));
  if(games[0].wins<=0)return "—";
  const tied=games.filter(g=>g.wins===games[0].wins);
  return tied.length>1?tied.map(g=>g.name).join(" / "):games[0].name;
}
function gsAdvancedMeta(p,bestLabel="—"){
  const rate=p.games?Math.round((Number(p.wins||0)/Number(p.games||1))*100):0;
  return `${Number(p.games||0)} partite · ${rate}% vittorie · ${gsPodiums(p)} podi · miglior punteggio ${bestLabel} · gioco top ${gsTopGameForPlayer(p.name)}`;
}

function openPlayerProfile(playerKey){
  const hall=loadHall();
  const rows=Object.entries(hall.players||{})
    .map(([key,p])=>({
      key,
      ...p,
      rate:p.games?((p.wins||0)/p.games*100):0,
      bestScore:p.bestScore||0
    }))
    .sort((a,b)=>(b.wins||0)-(a.wins||0) || b.rate-a.rate || (b.games||0)-(a.games||0) || a.name.localeCompare(b.name,"it"));

  const index=rows.findIndex(p=>p.key===playerKey);
  if(index<0)return;
  const p=rows[index];

  const medal=index===0?"🥇":index===1?"🥈":index===2?"🥉":"🏆";
  $("#profileName").textContent=p.name;
  $("#profileMedal").textContent=medal;
  $("#profileRank").textContent=`#${index+1} nella Hall of Fame`;
  $("#profileSubtitle").textContent="Statistiche personali Flip 7";
  $("#profileWins").textContent=p.wins||0;
  $("#profileGames").textContent=p.games||0;
  $("#profileRate").textContent=`${p.rate.toFixed(0)}%`;
  $("#profileBest").textContent=p.bestScore?`${p.bestScore}`:"—";
  $("#profilePodiums").textContent=gsPodiums(p);
  $("#profileTopGame").textContent=gsTopGameForPlayer(p.name);
  $("#profileLastWin").textContent=formatItalianDate(p.lastWin);

  openModal("playerProfileModal");
}

function renderHall(){
  setTimeout(gsUpdateHistoricalTrophyButtons,0);
  const hall=loadHall();
  const rows=Object.entries(hall.players||{})
    .map(([key,p])=>({
      key,
      ...p,
      rate:p.games?((p.wins||0)/p.games*100):0,
      bestScore:p.bestScore||0
    }))
    .sort((a,b)=>(b.wins||0)-(a.wins||0) || b.rate-a.rate || (b.games||0)-(a.games||0) || a.name.localeCompare(b.name,"it"));

  const totalWins=rows.reduce((s,p)=>s+(p.wins||0),0);
  $("#hallSummary").innerHTML=`
    <div class="summary-card"><b>${hall.totalGames||0}</b><span>Partite</span></div>
    <div class="summary-card"><b>${rows.length}</b><span>Giocatori</span></div>
    <div class="summary-card"><b>${totalWins}</b><span>Vittorie</span></div>`;

  if(!rows.length){
    $("#hallPodium").innerHTML="";
    $("#hallList").innerHTML='<div class="hall-empty">Nessuna partita conclusa ancora.<br>La prima vittoria comparirà qui.</div>';
    return;
  }

  const podiumColors=["#ffd20a","#c7d0df","#d88942"];
  const first3=rows.slice(0,3);
  const podiumOrder=[first3[1],first3[0],first3[2]].filter(Boolean);
  $("#hallPodium").innerHTML=podiumOrder.map((p)=>{
    const realPos=rows.indexOf(p);
    const cls=realPos===0?"first":"";
    const medal=realPos===0?"🥇":realPos===1?"🥈":"🥉";
    return `<button class="podium-card ${cls}" style="--pc:${podiumColors[realPos]}" onclick="openPlayerProfile('${esc(p.key)}')">
      ${realPos===0?'<div class="podium-crown">👑</div>':""}
      <div class="podium-medal">${medal}</div>
      <div class="podium-name">${esc(p.name)}</div>
      <div class="podium-wins">${p.wins||0}</div>
      <div class="podium-meta">${p.games||0} partite · ${p.rate.toFixed(0)}% · ${gsPodiums(p)} podi</div>
    </button>`;
  }).join("");

  const hallColors=["#ffd20a","#c7d0df","#d88942","#a84cff","#159dff","#35d44f","#ff304f","#ff8d19"];
  $("#hallList").innerHTML=rows.map((p,i)=>{
    const c=hallColors[i%hallColors.length];
    const medal=i===0?"🥇":i===1?"🥈":i===2?"🥉":`${i+1}°`;
    return `<button class="hall-row" style="--hc:${c}" onclick="openPlayerProfile('${esc(p.key)}')">
      <div class="hall-pos">${medal}</div>
      <div>
        <div class="hall-name">${esc(p.name)}</div>
        <div class="hall-meta">${gsAdvancedMeta(p,p.bestScore||"—")}</div>
      </div>
      <div class="hall-wins"><b>${p.wins||0}</b><span>Vittorie</span></div>
    </button>`;
  }).join("");
}
function clearHall(){
  if(confirm("Vuoi davvero cancellare tutta la classifica generale di Flip 7?")){
    localStorage.removeItem(HALL_KEY);
    renderHall();
  }
}



function showHome(){
  setTimeout(()=>window.renderResumeCenter?.(),0);
  $("#sixNimmtWorld").classList.add("hidden");
  hideAllGameWorlds();
  $("#homeScreen").classList.remove("hidden");
  window.scrollTo({top:0,behavior:"smooth"});
}

function enterFlip7(){
  $("#homeScreen").classList.add("hidden");
  $("#flip7App").classList.remove("hidden");
  render();
  window.scrollTo({top:0,behavior:"smooth"});
}

function hideAllGameWorlds(){
  $("#flip7App").classList.add("hidden");
  $("#sixNimmtWorld").classList.add("hidden");
  $("#seaSaltWorld").classList.add("hidden");
}

function homeChooseGame(game){
  $("#homeScreen").classList.add("hidden");
  hideAllGameWorlds();

  // v87: bonifica automatica anche delle partite concluse salvate
  // dalle versioni precedenti.
  if(game==="flip7" && state.resultRecorded){
    state={players:[],rounds:[],target:200,gameId:null,resultRecorded:false,turnIndex:0};
    save();
  }else if(game==="seasalt" && seaState.finished){
    seaState={players:[],rounds:[],target:40,finished:false,winner:null,recorded:false,turnIndex:0};
    seaSave();
  }else if((game==="sixnimmt" || game==="6nimmt") && six39State.finished){
    six39State={players:[],rounds:[],finished:false,winner:null,recorded:false,turnIndex:0};
    six39Save();
  }

  if(game==="flip7"){
    $("#flip7App").classList.remove("hidden");
    render();
  }else if(game==="seasalt"){
    seaShow();
    return;
  }else if(game==="sixnimmt" || game==="6nimmt"){
    six39Show();
    return;
  }
  window.scrollTo({top:0,behavior:"smooth"});
}

function openGameSelector(){
  openModal("gameSelectorModal");
}

function chooseGame(game){
  if(game==="flip7"){
    closeModal("gameSelectorModal");
    return;
  }
  const label=game==="6nimmt" ? "6... Le prendi!" : "Sea Salt & Paper";
  alert(`${label}: il modulo grafico verrà aggiunto quando prepareremo il suo segnapunti.`);
}

$("#minusPlayer").onclick=()=>changeCount(-1);
$("#plusPlayer").onclick=()=>changeCount(1);
$("#startGame").onclick=startGame;
$("#editPlayers").onclick=editPlayers;
$("#openRound").onclick=()=>{
  delete $("#saveRound").dataset.editRound;
  $("#modalRound").textContent=state.rounds.length+1;
  render();
  openModal("roundModal");
};
$("#saveRound").onclick=saveRound;
$("#undo").onclick=undo;
$("#history").onclick=()=>openModal("historyModal");
$("#deleteGameBtn").onclick=deleteCurrentGame;
$("#hallBtn").onclick=()=>{renderHall();openModal("hallModal")};
$("#gameSelectorBtn").onclick=showHome;
$$(".game-choice").forEach(b=>b.onclick=()=>chooseGame(b.dataset.game));
$("#clearHall").onclick=clearHall;
$$("[data-close]").forEach(b=>b.onclick=()=>closeModal(b.dataset.close));
$$(".modal").forEach(m=>m.addEventListener("click",e=>{if(e.target===m)closeModal(m.id)}));


$("#homeHallBtn").onclick=()=>{
  openModal("hallGameSelectorModal");
};
$$("[data-home-game]").forEach(b=>b.onclick=()=>homeChooseGame(b.dataset.homeGame));

$$("[data-hall-game]").forEach(b=>b.onclick=()=>{
  const game=b.dataset.hallGame;
  closeModal("hallGameSelectorModal");
  if(game==="flip7"){
    renderHall();
    openModal("hallModal");
  }else if(game==="seasalt"){
    seaRenderHall();
    openModal("seaHallModal");
  }else if(game==="sixnimmt"){
    six39RenderHall();
    openModal("six39HallModal");
  }
});

$$("[data-world-back]").forEach(b=>b.onclick=showHome);



$("#newGameBtn").onclick=()=>{
  gsHidePerfectWin("winScreen");
  newGame();
  $("#homeScreen").classList.add("hidden");
  hideAllGameWorlds();
  $("#flip7App").classList.remove("hidden");
  showSetup();
  window.scrollTo({top:0,behavior:"smooth"});
};


load();
showHome();


/* =========================
   SEA SALT & PAPER - v20
   ========================= */
const SEA_KEY="gameScoreSeaSaltV1";
const SEA_HALL_KEY="gameScoreSeaSaltHallV1";
let seaState={players:[],rounds:[],target:40,finished:false,winner:null,recorded:false,turnIndex:0};
let seaSetupCount=2;
let seaSetupDraftNames=[];

function seaLoad(){seaState=gsRobustLoad(SEA_KEY,seaState)}
function seaSave(){gsRobustSave(SEA_KEY,seaState,"seasalt",!!seaState.players.length && !seaState.finished)}
function seaTotals(){return seaState.players.map((_,i)=>seaState.rounds.reduce((s,r)=>s+(Number(r[i])||0),0))}
function seaTargetFor(n){return n===2?40:n===3?35:30}
function seaHallLoad(){try{return JSON.parse(localStorage.getItem(SEA_HALL_KEY))||{games:0,players:{}}}catch(e){return{games:0,players:{}}}}
function seaHallSave(h){localStorage.setItem(SEA_HALL_KEY,JSON.stringify(h));setTimeout(gsUpdateHistoricalTrophyButtons,0)}
function seaKey(n){return n.trim().toLocaleLowerCase("it")}

function seaShow(){
  $("#homeScreen").classList.add("hidden");
  hideAllGameWorlds();
  $("#seaSaltWorld").classList.remove("hidden");
  if(!seaState.players.length){
    seaOpenInlineSetup(false);
  }else{
    $("#seaSetupView").classList.add("hidden");
    $("#seaGameView").classList.remove("hidden");
    seaRender();
  }
  window.scrollTo({top:0});
}

function seaCaptureInlineNames(){
  const inputs=$$(".sea-setup-name");
  if(inputs.length) seaSetupDraftNames=inputs.map(x=>x.value);
}

function seaRenderInlineSetupInputs(){
  $("#seaPlayerCountInline").textContent=seaSetupCount;
  $("#seaNameInputsInline").innerHTML=Array.from({length:seaSetupCount},(_,i)=>`
    <div class="sea-setup-row">
      <div class="sea-player-index">${i+1}</div>
      <input class="sea-setup-name" placeholder="Nome giocatore ${i+1}" autocomplete="off" value="${esc(seaSetupDraftNames[i]||"")}">
    </div>`).join("");
}

function seaOpenInlineSetup(edit=false){
  seaSetupCount=edit?seaState.players.length:Math.max(2,Math.min(4,seaState.players.length||2));
  seaSetupDraftNames=edit?[...seaState.players]:[];
  $("#seaGameView").classList.add("hidden");
  $("#seaSetupView").classList.remove("hidden");
  $("#seaSetupView").dataset.edit=edit?"1":"0";
  seaRenderInlineSetupInputs();
  window.scrollTo({top:0,behavior:"smooth"});
}

function seaChangeInlineCount(delta){
  seaCaptureInlineNames();
  seaSetupCount=Math.max(2,Math.min(4,seaSetupCount+delta));
  if(seaSetupDraftNames.length>seaSetupCount){
    seaSetupDraftNames=seaSetupDraftNames.slice(0,seaSetupCount);
  }
  seaRenderInlineSetupInputs();
}

function seaStart(){
  const names=$$(".sea-setup-name").map(x=>x.value.trim());
  if(names.some(n=>!n)){
    alert("Inserisci il nome di tutti i giocatori.");
    return;
  }
  const normalized=names.map(seaKey);
  if(new Set(normalized).size!==normalized.length){
    alert("I nomi dei giocatori devono essere diversi.");
    return;
  }

  const edit=$("#seaSetupView").dataset.edit==="1";
  if(edit){
    const oldPlayers=[...seaState.players];
    const oldRounds=seaState.rounds.map(r=>[...r]);
    const oldMap=new Map(oldPlayers.map((n,i)=>[seaKey(n),i]));
    const remappedRounds=oldRounds.map(r=>names.map(n=>{
      const oldIndex=oldMap.get(seaKey(n));
      return oldIndex===undefined?0:(Number(r[oldIndex])||0);
    }));
    seaState.players=names;
  gsResetTurn(seaState);
    seaState.rounds=remappedRounds;
    seaState.target=seaTargetFor(names.length);
    seaState.finished=false;
    seaState.winner=null;
    seaState.recorded=false;
  }else{
    seaState={players:names,rounds:[],target:seaTargetFor(names.length),finished:false,winner:null,recorded:false,turnIndex:0};
  }

  seaSetupDraftNames=[];
  seaSave();
  $("#seaSetupView").classList.add("hidden");
  $("#seaGameView").classList.remove("hidden");
  seaRender();
}function seaRender(){
  if(!seaState.players.length)return;
  const totals=seaTotals();
  const order=seaState.players.map((name,i)=>({name,i,total:totals[i]})).sort((a,b)=>b.total-a.total||a.i-b.i);
  $("#seaRoundNo").textContent=seaState.rounds.length+1;
  if($("#seaTurnName"))$("#seaTurnName").textContent=gsTurnName(seaState);
  $("#seaTarget").textContent=seaState.target; $("#seaTargetBox").textContent=seaState.target;
  const max=Math.max(0,...totals), pct=Math.min(100,max/seaState.target*100);
  $("#seaProgress").style.width=pct+"%";
  $("#seaProgressText").textContent=seaState.rounds.length?`Miglior totale: ${max} punti`:"Partita appena iniziata";
  const colors=["#79e2dc","#55aee8","#e8d6a5","#ef8bb7"];
  const seaIcons=["⛵","🐟","🐚","🐙"];
  const seaLabels=["BARCA","PESCE","CONCHIGLIA","POLPO"];
  $("#seaRanking").innerHTML=order.map((p,pos)=>{
    const c=colors[p.i%colors.length];
    const last=seaState.rounds.length?(seaState.rounds.at(-1)[p.i]||0):0;
    const missing=Math.max(0,seaState.target-p.total);
    const status=totals.every(t=>t===totals[0])?"":(pos===0?"IN TESTA":pos===order.length-1?"ULTIMO":"");

    const seaCards=[
      {img:"assets/sea46-card-boat.jpg",emoji:"⛵",label:"BARCA"},
      {img:"assets/sea46-card-fish.jpg",emoji:"🐟",label:"PESCE"},
      {emoji:"⭐",label:"STELLA"},
      {emoji:"🐚",label:"CONCHIGLIA"}
    ];
    const card=seaCards[p.i%seaCards.length];

    return `<article class="sea49-player-row" style="--sc:${c}">
      ${status?`<div class="sea49-status">${status}</div>`:""}

      <div class="sea49-rank">
        <span>${pos+1}°</span>
        ${pos===0?`<b>♛</b>`:`<b>✦</b>`}
      </div>

      <div class="sea49-medallion">
        <div class="sea49-medallion-glow"></div>
        ${card.img
          ? `<img src="${card.img}" alt="${card.label}">`
          : `<div class="sea49-origami">${card.emoji}</div>`}
        <span>${card.label}</span>
      </div>

      <div class="sea49-player-main">
        <div class="sea49-player-name">${esc(p.name)}</div>
        <div class="sea49-lastline">
          <span>ULTIMO ROUND</span>
          <b>+${last}</b>
        </div>
      </div>

      <div class="sea49-score-side">
        <div class="sea49-total">${p.total}</div>
        <div class="sea49-points-label">PUNTI</div>
        <div class="sea49-missing">${missing?`Mancano <b>${missing}</b>`:"Traguardo raggiunto"}</div>
      </div>
    </article>`;
  }).join("");
}
function seaOpenRound(editIndex=null){
  $("#seaRoundModalTitle").textContent=editIndex===null?`Round ${seaState.rounds.length+1}`:`Modifica Round ${editIndex+1}`;
  $("#seaSaveRound").dataset.edit=editIndex===null?"":String(editIndex);
  const vals=editIndex===null?[]:seaState.rounds[editIndex];
  $("#seaRoundInputs").innerHTML=seaState.players.map((n,i)=>`<div class="sea-input-row"><input value="${esc(n)}" disabled><input class="sea-round-score" type="number" min="0" inputmode="numeric" value="${vals?.[i]??0}"></div>`).join("");
  openModal("seaRoundModal");
}
function seaToast(msg){const t=$("#seaToast");t.textContent=msg;t.classList.remove("show");void t.offsetWidth;t.classList.add("show");try{navigator.vibrate?.([30,20,45])}catch(e){}}
function seaSaveRound(){
  const vals=$$(".sea-round-score").map(x=>Math.max(0,parseInt(x.value)||0));
  const e=$("#seaSaveRound").dataset.edit;
  let rn;
  if(e!==""){rn=Number(e)+1;seaState.rounds[Number(e)]=vals}else{seaState.rounds.push(vals);
    gsMoveTurn(seaState,1);rn=seaState.rounds.length}
  seaSave();gsPlaySound("round");closeModal("seaRoundModal");seaRender();seaToast(`✓ Round ${rn} ${e!==""?"aggiornato":"registrato"}`);
  setTimeout(seaCheckWinner,250);
}
function seaCheckWinner(){
  if(seaState.finished)return;
  const totals=seaTotals(), eligible=totals.map((t,i)=>({t,i})).filter(x=>x.t>=seaState.target);
  if(!eligible.length)return;
  const max=Math.max(...totals), tied=totals.map((t,i)=>({t,i})).filter(x=>x.t===max);
  if(tied.length>1){
    const names=tied.map(x=>seaState.players[x.i]).join(", ");
    const chosen=prompt(`Parità a ${max} punti tra ${names}.\nInserisci il nome del giocatore che ha giocato per ultimo nell'ultimo round:`);
    const found=tied.find(x=>seaKey(seaState.players[x.i])===seaKey(chosen||""));
    if(!found)return;
    seaFinish(found.i,false);
  }else seaFinish(tied[0].i,false);
}
function seaFinish(i,mermaids=false){
  const totals=seaTotals(),name=seaState.players[i];
  seaState.finished=true;
  seaState.winner=i;

  if(!seaState.recorded){
    const hall=seaHallLoad();
    hall.games=(hall.games||0)+1;
    seaState.players.forEach((n,pi)=>{
      const k=seaKey(n);
      hall.players[k]=hall.players[k]||{name:n,wins:0,games:0,best:0,lastWin:null,podiums:0};
      hall.players[k].name=n;
      hall.players[k].games=(hall.players[k].games||0)+1;
      hall.players[k].best=Math.max(hall.players[k].best||0,totals[pi]||0);
    });
    const k=seaKey(name);
    hall.players[k].wins=(hall.players[k].wins||0)+1;
    hall.players[k].lastWin=new Date().toISOString();

    const seaOrder=[
      {n:name,i,t:totals[i]||0},
      ...seaState.players.map((n,j)=>({n,j,t:totals[j]||0})).filter(x=>x.j!==i)
        .sort((a,b)=>b.t-a.t || a.j-b.j)
    ];
    seaOrder.slice(0,3).forEach(x=>{
      const pk=seaKey(x.n),p=hall.players[pk];
      p.podiums=Math.max(Number(p.podiums||0),Number(p.wins||0)-(x.j===i?1:0))+1;
    });
    Object.values(hall.players).forEach(p=>{p.podiums=Math.max(Number(p.podiums||0),Number(p.wins||0))});

    seaHallSave(hall);
    seaState.recorded=true;
  }
  seaSave();

  $("#seaWinTitle").textContent=`${name.toUpperCase()} VINCE!`;
  $("#seaWinScore").textContent=mermaids?"4 🧜‍♀️":totals[i];
  const order=seaState.players.map((n,j)=>({n,j,t:totals[j]})).sort((a,b)=>b.t-a.t);
  $("#seaFinalRanking").innerHTML=order.map((x,r)=>`<div class="final-row ${x.j===i?"winner-row":""}" style="--fc:#79e2dc"><div class="final-pos">${r===0?"🥇":r===1?"🥈":r===2?"🥉":r+1+"°"}</div><div class="final-name">${esc(x.n)}</div><div class="final-points"><b>${x.t}</b><span>punti</span></div></div>`).join("");
  gsShowPerfectWin("seaWinScreen","sea");
  gsPlaySound("win");
  // V103: lascia montare e vedere l'animazione prima di azzerare la partita attiva.
  setTimeout(()=>gsAutoArchiveCompletedGame("sea"),1800);
}
function seaRenderHistory(){
  $("#seaHistoryList").innerHTML=seaState.rounds.length?seaState.rounds.map((r,i)=>`<div class="sea-history-card"><div class="sea-history-head"><b>Round ${i+1}</b><div class="sea-history-actions"><button onclick="closeModal('seaHistoryModal');seaOpenRound(${i})">Modifica</button><button class="danger" onclick="seaDeleteRound(${i})">Elimina</button></div></div>${r.map((v,j)=>`<div>${esc(seaState.players[j])}: <b>+${v}</b></div>`).join("")}</div>`).reverse().join(""):'<p class="helper">Ancora nessun round.</p>';
}
function seaDeleteRound(i){if(seaState.finished)return alert("La partita è già conclusa.");if(confirm(`Eliminare Round ${i+1}?`)){seaState.rounds.splice(i,1);seaSave();seaRender();seaRenderHistory()}}
function seaRenderHall(){
  setTimeout(gsUpdateHistoricalTrophyButtons,0);
  const h=seaHallLoad();
  const rows=Object.values(h.players||{})
    .map(p=>({...p,rate:p.games?((p.wins||0)/p.games*100):0}))
    .sort((a,b)=>(b.wins||0)-(a.wins||0) || b.rate-a.rate || (b.games||0)-(a.games||0) || a.name.localeCompare(b.name,"it"));

  const totalWins=rows.reduce((s,p)=>s+(p.wins||0),0);

  $("#seaHallSummary").innerHTML=`
    <div class="summary-card"><b>${h.games||0}</b><span>Partite</span></div>
    <div class="summary-card"><b>${rows.length}</b><span>Giocatori</span></div>
    <div class="summary-card"><b>${totalWins}</b><span>Vittorie</span></div>`;

  if(!rows.length){
    $("#seaHallPodium").innerHTML="";
    $("#seaHallList").innerHTML='<div class="sea-hall-empty">Nessuna partita conclusa ancora.<br>La prima vittoria comparirà qui.</div>';
    return;
  }

  const podiumColors=["#8cece5","#c7d0df","#d7a36d"];
  const first3=rows.slice(0,3);
  const podiumOrder=[first3[1],first3[0],first3[2]].filter(Boolean);

  $("#seaHallPodium").innerHTML=podiumOrder.map((p)=>{
    const realPos=rows.indexOf(p);
    const cls=realPos===0?"first":"";
    const medal=realPos===0?"🥇":realPos===1?"🥈":"🥉";
    return `<div class="podium-card ${cls}" style="--pc:${podiumColors[realPos]}">
      ${realPos===0?'<div class="podium-crown">👑</div>':""}
      <div class="podium-medal">${medal}</div>
      <div class="podium-name">${esc(p.name)}</div>
      <div class="podium-wins">${p.wins||0}</div>
      <div class="podium-meta">${p.games||0} partite · ${p.rate.toFixed(0)}% · ${gsPodiums(p)} podi</div>
    </div>`;
  }).join("");

  const hallColors=["#8cece5","#c7d0df","#d7a36d","#69b7e9","#ef8fba","#a3db8c","#f2d08a","#80d3c8"];

  $("#seaHallList").innerHTML=rows.map((p,i)=>{
    const c=hallColors[i%hallColors.length];
    const medal=i===0?"🥇":i===1?"🥈":i===2?"🥉":`${i+1}°`;
    return `<div class="hall-row" style="--hc:${c}">
      <div class="hall-pos">${medal}</div>
      <div>
        <div class="hall-name">${esc(p.name)}</div>
        <div class="hall-meta">${p.games||0} partite · ${p.rate.toFixed(0)}% vittorie · miglior punteggio ${p.best||"—"}</div>
      </div>
      <div class="hall-wins"><b>${p.wins||0}</b><span>Vittorie</span></div>
    </div>`;
  }).join("");
}
function seaClearHall(){
  if(!confirm("Vuoi davvero cancellare tutta la classifica generale di Sea Salt & Paper?")){
    return;
  }
  localStorage.removeItem(SEA_HALL_KEY);
  seaRenderHall();
  try{
    if(navigator.vibrate) navigator.vibrate([30,25,50]);
  }catch(e){}
}

function seaDeleteGame(){if(confirm("Eliminare completamente questa partita Sea Salt & Paper?")){seaState={players:[],rounds:[],target:40,finished:false,winner:null,recorded:false,turnIndex:0};seaSave();$("#seaWinScreen").classList.add("hidden");showHome();window.renderResumeCenter?.()}}
function seaRematch(){seaState.rounds=[];seaState.finished=false;seaState.winner=null;seaState.recorded=false;seaSave();$("#seaWinScreen").classList.add("hidden");seaRender()}
function seaOpenMermaids(){
 $("#seaMermaidPlayers").innerHTML=seaState.players.map((n,i)=>`<button onclick="closeModal('seaMermaidModal');seaFinish(${i},true)">${esc(n)}</button>`).join("");
 openModal("seaMermaidModal");
}

seaLoad();
$("#seaMinusInline").onclick=()=>seaChangeInlineCount(-1);
$("#seaPlusInline").onclick=()=>seaChangeInlineCount(1);
$("#seaStartInline").onclick=seaStart;
$("#seaMinus").onclick=()=>{seaSetupCount=Math.max(2,seaSetupCount-1);seaRenderSetupInputs()};
$("#seaPlus").onclick=()=>{seaSetupCount=Math.min(4,seaSetupCount+1);seaRenderSetupInputs()};
$("#seaStart").onclick=seaStart;
$("#seaEditPlayers").onclick=()=>seaOpenInlineSetup(true);
$("#seaOpenRound").onclick=()=>seaOpenRound();
$("#seaSaveRound").onclick=seaSaveRound;
$("#seaUndo").onclick=()=>{if(seaState.rounds.length&&confirm("Annullare l'ultimo round?")){seaState.rounds.pop();seaSave();seaRender()}};
$("#seaHistory").onclick=()=>{seaRenderHistory();openModal("seaHistoryModal")};
$("#seaDeleteGame").onclick=seaDeleteGame;
$("#seaMermaids").onclick=seaOpenMermaids;
$("#seaTrophyBtn").onclick=()=>{seaRenderHall();openModal("seaHallModal")};
$("#seaClearHall").onclick=seaClearHall;

$("#seaNewGame").onclick=()=>{seaState={players:[],rounds:[],target:40,finished:false,winner:null,recorded:false,turnIndex:0};seaSave();$("#seaWinScreen").classList.add("hidden");seaOpenInlineSetup(false)};



/* ===========================
   v39 — 6... LE PRENDI!
   Layout gemello di Flip 7
   =========================== */
const SIX39_KEY="gs_six39_game", SIX39_HALL="gs_six39_hall";
let six39State={players:[],rounds:[],finished:false,winner:null,recorded:false,turnIndex:0};
let six39Count=3, six39Draft=[], six39EditDraft=[];
const six39Colors=["#ffd20a","#b747ff","#1fa8ff","#31d25d","#ff6b35","#ff4c87","#4dd8d2","#8d7cff","#e9db51","#d88942"];

function six39Key(v){return String(v||"").trim().toLocaleLowerCase("it")}
function six39Load(){six39State=gsRobustLoad(SIX39_KEY,six39State)}
function six39Save(){gsRobustSave(SIX39_KEY,six39State,"sixnimmt",!!six39State.players.length && !six39State.finished)}
function six39Totals(){return six39State.players.map((_,i)=>six39State.rounds.reduce((s,r)=>s+(Number(r[i])||0),0))}
function six39HallLoad(){try{return JSON.parse(localStorage.getItem(SIX39_HALL)||'{"games":0,"players":{}}')}catch(e){return{games:0,players:{}}}}
function six39HallSave(h){localStorage.setItem(SIX39_HALL,JSON.stringify(h));setTimeout(gsUpdateHistoricalTrophyButtons,0)}

function six39Show(){
  $("#homeScreen").classList.add("hidden");
  hideAllGameWorlds();
  $("#sixNimmtWorld").classList.remove("hidden");
  if(six39State.players.length){
    $("#six39SetupView").classList.add("hidden");
    $("#six39GameView").classList.remove("hidden");
    six39Render();
  }else six39OpenSetup(false);
  window.scrollTo({top:0});
}
function six39OpenSetup(edit=false){
  $("#six39GameView").classList.add("hidden");
  $("#six39SetupView").classList.remove("hidden");
  six39Count=edit?six39State.players.length:Math.max(2,Math.min(10,six39State.players.length||3));
  six39Draft=edit?[...six39State.players]:[];
  six39RenderNames();
  window.scrollTo({top:0,behavior:"smooth"});
}
function six39Capture(){six39Draft=$$(".six39-name").map(x=>x.value)}
function six39RenderNames(){
  $("#six39Count").textContent=six39Count;
  $("#six39NameRows").innerHTML=Array.from({length:six39Count},(_,i)=>`
    <div class="six39-name-row">
      <div class="six39-index">${i+1}</div>
      <input class="six39-name" placeholder="Nome giocatore ${i+1}" value="${esc(six39Draft[i]||"")}">
    </div>`).join("");
}
function six39ChangeCount(d){
  six39Capture();
  six39Count=Math.max(2,Math.min(10,six39Count+d));
  six39Draft=six39Draft.slice(0,six39Count);
  six39RenderNames();
}
function six39Create(){
  const names=$$(".six39-name").map(x=>x.value.trim());
  if(names.some(n=>!n)) return alert("Inserisci il nome di tutti i giocatori.");
  if(new Set(names.map(six39Key)).size!==names.length) return alert("I nomi devono essere diversi.");
  six39State={players:names,rounds:[],finished:false,winner:null,recorded:false,turnIndex:0};
  six39Save();
  $("#six39SetupView").classList.add("hidden");
  $("#six39GameView").classList.remove("hidden");
  six39Render();
}
function six39Render(){
  const totals=six39Totals();
  const order=six39State.players.map((name,i)=>({name,i,total:totals[i]}))
    .sort((a,b)=>a.total-b.total || a.i-b.i);
  const last=six39State.rounds.at(-1)||[];
  $("#six39RoundNo").textContent=six39State.rounds.length+1;
  if($("#sixTurnName"))$("#sixTurnName").textContent=gsTurnName(six39State);
  const max=Math.max(0,...totals);
  $("#six39Progress").style.width=Math.min(100,max/67*100)+"%";
  $("#six39ProgressText").textContent=six39State.rounds.length?`Punteggio più alto: ${max} teste di bue`:"Partita appena iniziata";

  $("#six39Ranking").innerHTML=order.map((p,pos)=>{
    const c=six39Colors[p.i%six39Colors.length];
    const status=totals.every(t=>t===totals[0])?"":(pos===0?"IN TESTA":pos===order.length-1?"ULTIMO":"");
    const art=["assets/six45-player-gold.jpg","assets/six45-player-purple.jpg","assets/six45-player-blue.jpg"][p.i%3];
    const cardNo=String(p.i+1).padStart(2,"0");
    return `<article class="six45-player-row" style="--pc:${c}">
      ${status?`<div class="six45-status">${status}</div>`:""}

      <div class="six45-rank-badge">
        <div class="six45-crown">${pos===0?"♛":"♕"}</div>
        <div class="six45-rank-num">${pos+1}°</div>
      </div>

      <div class="six45-bull-art">
        <img src="${art}" alt="">
        <div class="six45-number-card">
          <span class="six45-mini-bulls">🐂　🐂</span>
          <strong>${cardNo}</strong>
          <span class="six45-mini-bulls bottom">🐂</span>
        </div>
      </div>

      <div class="six45-player-main">
        <div class="six45-player-name">${esc(p.name)}</div>
        <div class="six45-last-line">
          <span>Ultimo round</span>
          <b>+${Number(last[p.i]||0)}</b>
        </div>
      </div>

      <div class="six45-score-side">
        <div class="six45-total">${p.total}</div>
        <div class="six45-threshold">${p.total>66?"OLTRE 66":p.total===66?"SOGLIA RAGGIUNTA":`Mancano ${66-p.total}`}</div>
      </div>
    </article>`;
  }).join("");

  if(!six39State.finished && order.some(p=>p.total>66)){
    const winner=order[0];
    six39State.finished=true;
    six39State.winner=winner.i;
    six39State.recorded=false;
    six39Save();
    six39ShowWin(winner.i);
  }
}
function six39OpenRound(editIndex=null){
  $("#six39RoundModalTitle").textContent=editIndex===null?`Round ${six39State.rounds.length+1}`:`Modifica Round ${editIndex+1}`;
  $("#six39SaveRound").dataset.edit=editIndex===null?"":String(editIndex);
  const vals=editIndex===null?[]:six39State.rounds[editIndex];
  $("#six39RoundInputs").innerHTML=six39State.players.map((n,i)=>`
    <div class="six39-input-row">
      <input value="${esc(n)}" disabled>
      <input class="six39-round-score" type="number" min="0" inputmode="numeric" value="${vals?.[i]??0}">
    </div>`).join("");
  openModal("six39RoundModal");
}
function six39SaveRound(){
  const vals=$$(".six39-round-score").map(x=>Math.max(0,parseInt(x.value)||0));
  const e=$("#six39SaveRound").dataset.edit;
  let rn;
  if(e!==""){rn=Number(e)+1;six39State.rounds[Number(e)]=vals}else{six39State.rounds.push(vals);
    gsMoveTurn(six39State,1);rn=six39State.rounds.length}
  six39State.finished=false;six39State.winner=null;six39State.recorded=false;
  six39Save();gsPlaySound("round");closeModal("six39RoundModal");six39Render();
  const t=$("#six39Toast");t.textContent=`✓ Round ${rn} ${e!==""?"aggiornato":"registrato"}`;t.classList.remove("show");void t.offsetWidth;t.classList.add("show");
  try{navigator.vibrate?.([30,20,45])}catch(e){}
}
function six39Undo(){
  if(!six39State.rounds.length)return;
  if(!confirm("Annullare l'ultimo round?"))return;
  six39State.rounds.pop();six39State.finished=false;six39State.winner=null;six39State.recorded=false;six39Save();six39Render();
}
function six39RenderHistory(){
  $("#six39HistoryList").innerHTML=six39State.rounds.length?six39State.rounds.map((r,i)=>`
    <div class="six39-history-card">
      <div class="six39-history-head"><b>Round ${i+1}</b><div class="six39-history-actions">
        <button onclick="closeModal('six39HistoryModal');six39OpenRound(${i})">Modifica</button>
        <button class="danger" onclick="six39DeleteRound(${i})">Elimina</button>
      </div></div>
      ${r.map((v,j)=>`<div>${esc(six39State.players[j])}: <b>+${v}</b></div>`).join("")}
    </div>`).reverse().join(""):'<p class="helper">Ancora nessun round.</p>';
}
function six39DeleteRound(i){
  if(six39State.finished)return alert("La partita è già conclusa.");
  if(confirm(`Eliminare Round ${i+1}?`)){six39State.rounds.splice(i,1);six39Save();six39Render();six39RenderHistory()}
}
function six39OpenEdit(){
  six39EditDraft=[...six39State.players];
  six39RenderEditRows();
  openModal("six39EditModal");
}
function six39RenderEditRows(){
  $("#six39EditRows").innerHTML=six39EditDraft.map((n,i)=>`
    <div class="six39-name-row">
      <div class="six39-index">${i+1}</div>
      <input class="six39-edit-name" data-i="${i}" value="${esc(n)}">
    </div>`).join("");
}
function six39AddPlayer(){
  if(six39EditDraft.length>=10)return alert("Massimo 10 giocatori.");
  six39EditDraft.push(`Giocatore ${six39EditDraft.length+1}`);
  six39RenderEditRows();
}
function six39SavePlayers(){
  const names=$$(".six39-edit-name").map(x=>x.value.trim());
  if(names.length<2)return alert("Servono almeno 2 giocatori.");
  if(names.some(n=>!n))return alert("Inserisci tutti i nomi.");
  if(new Set(names.map(six39Key)).size!==names.length)return alert("I nomi devono essere diversi.");
  const old=six39State.players,map=new Map(old.map((n,i)=>[six39Key(n),i]));
  six39State.rounds=six39State.rounds.map(r=>names.map(n=>map.has(six39Key(n))?(Number(r[map.get(six39Key(n))])||0):0));
  six39State.players=names;
  gsResetTurn(six39State);six39State.finished=false;six39State.winner=null;six39State.recorded=false;six39Save();
  closeModal("six39EditModal");six39Render();
}
function six39DeleteGame(){
  if(!confirm("Eliminare completamente questa partita?"))return;
  six39State={players:[],rounds:[],finished:false,winner:null,recorded:false,turnIndex:0};
  six39Save();six39OpenSetup(false);window.renderResumeCenter?.();
}
function six39ShowWin(i){
  const totals=six39Totals();
  const order=six39State.players.map((n,j)=>({n,j,t:totals[j]})).sort((a,b)=>a.t-b.t);
  $("#six39WinTitle").textContent=`${six39State.players[i].toUpperCase()} VINCE!`;
  $("#six39WinScore").textContent=totals[i];
  $("#six39FinalRanking").innerHTML=order.map((x,r)=>`
    <div class="final-row ${x.j===i?"winner-row":""}" style="--fc:${six39Colors[x.j%six39Colors.length]}">
      <div class="final-pos">${r===0?"🥇":r===1?"🥈":r===2?"🥉":r+1+"°"}</div>
      <div class="final-name">${esc(x.n)}</div>
      <div class="final-points"><b>${x.t}</b><span>teste di bue</span></div>
    </div>`).join("");
  if(!six39State.recorded)six39RecordWin();
  gsShowPerfectWin("six39WinScreen","six");
  gsPlaySound("win");
  // V103: lascia montare e vedere l'animazione prima di azzerare la partita attiva.
  setTimeout(()=>gsAutoArchiveCompletedGame("six"),1800);
}
function six39RecordWin(){
  if(six39State.recorded||six39State.winner===null)return;
  const hall=six39HallLoad(),totals=six39Totals();
  hall.games=(hall.games||0)+1;
  six39State.players.forEach((n,i)=>{
    const k=six39Key(n),p=hall.players[k]||{name:n,wins:0,games:0,best:null,lastWin:null,podiums:0};
    p.name=n;
    p.games=(p.games||0)+1;
    p.best=p.best===null||p.best===undefined?totals[i]:Math.min(p.best,totals[i]);
    if(i===six39State.winner){p.wins=(p.wins||0)+1;p.lastWin=new Date().toISOString()}
    hall.players[k]=p;
  });
  const order=six39State.players.map((n,i)=>({n,i,t:totals[i]||0}))
    .sort((a,b)=>a.t-b.t || a.i-b.i);
  order.slice(0,3).forEach(x=>{
    const k=six39Key(x.n),p=hall.players[k];
    p.podiums=Math.max(Number(p.podiums||0),Number(p.wins||0)-(x.i===six39State.winner?1:0))+1;
  });
  Object.values(hall.players).forEach(p=>{p.podiums=Math.max(Number(p.podiums||0),Number(p.wins||0))});
  six39HallSave(hall);six39State.recorded=true;six39Save();
}
function six39RenderHall(){
  setTimeout(gsUpdateHistoricalTrophyButtons,0);
  const h=six39HallLoad(),rows=Object.values(h.players||{}).map(p=>({...p,rate:p.games?((p.wins||0)/p.games*100):0}))
    .sort((a,b)=>(b.wins||0)-(a.wins||0)||b.rate-a.rate||(b.games||0)-(a.games||0)||a.name.localeCompare(b.name,"it"));
  $("#six39HallSummary").innerHTML=`
    <div class="summary-card"><b>${h.games||0}</b><span>Partite</span></div>
    <div class="summary-card"><b>${rows.length}</b><span>Giocatori</span></div>
    <div class="summary-card"><b>${rows.reduce((s,p)=>s+(p.wins||0),0)}</b><span>Vittorie</span></div>`;
  if(!rows.length){$("#six39HallPodium").innerHTML="";$("#six39HallList").innerHTML='<div class="empty-state">Nessuna partita conclusa ancora.</div>';return}
  const pc=["#ffd20a","#c7d0df","#d88942"],first3=rows.slice(0,3),po=[first3[1],first3[0],first3[2]].filter(Boolean);
  $("#six39HallPodium").innerHTML=po.map(p=>{const idx=rows.indexOf(p);return `<div class="podium-card ${idx===0?"first":""}" style="--pc:${pc[idx]}">${idx===0?'<div class="podium-crown">👑</div>':""}<div class="podium-medal">${idx===0?"🥇":idx===1?"🥈":"🥉"}</div><div class="podium-name">${esc(p.name)}</div><div class="podium-wins">${p.wins||0}</div><div class="podium-meta">${p.games||0} partite · ${p.rate.toFixed(0)}% · ${gsPodiums(p)} podi</div></div>`}).join("");
  $("#six39HallList").innerHTML=rows.map((p,i)=>`<div class="hall-row" style="--hc:${six39Colors[i%six39Colors.length]}"><div class="hall-pos">${i===0?"🥇":i===1?"🥈":i===2?"🥉":i+1+"°"}</div><div><div class="hall-name">${esc(p.name)}</div><div class="hall-meta">${gsAdvancedMeta(p,p.best??"—")}</div></div><div class="hall-wins"><b>${p.wins||0}</b><span>Vittorie</span></div></div>`).join("");
}
function six39ResetHall(){if(confirm("Azzerare tutta la classifica generale?")){six39HallSave({games:0,players:{}});six39RenderHall()}}
function six39Rematch(){six39State.rounds=[];six39State.finished=false;six39State.winner=null;six39State.recorded=false;six39Save();$("#six39WinScreen").classList.add("hidden");six39Render()}
function six39NewGame(){six39State={players:[],rounds:[],finished:false,winner:null,recorded:false,turnIndex:0};six39Save();$("#six39WinScreen").classList.add("hidden");six39OpenSetup(false)}

six39Load();
$("#six39GamesBtn").onclick=showHome;
$("#six39HallBtn").onclick=()=>{six39RenderHall();openModal("six39HallModal")};
$("#six39Minus").onclick=()=>six39ChangeCount(-1);
$("#six39Plus").onclick=()=>six39ChangeCount(1);
$("#six39Create").onclick=six39Create;
$("#six39EditPlayers").onclick=six39OpenEdit;
$("#six39OpenRound").onclick=()=>six39OpenRound();
$("#six39SaveRound").onclick=six39SaveRound;
$("#six39Undo").onclick=six39Undo;
$("#six39HistoryBtn").onclick=()=>{six39RenderHistory();openModal("six39HistoryModal")};
$("#six39DeleteGame").onclick=six39DeleteGame;
$("#six39AddPlayer").onclick=six39AddPlayer;
$("#six39SavePlayers").onclick=six39SavePlayers;
$("#six39ResetHall").onclick=six39ResetHall;

$("#six39NewGame").onclick=six39NewGame;

/* =========================================================
   GAME SCORE v48 — Unified Experience Layer
   Non cambia le regole: uniforma popup, feedback e identità UX.
   ========================================================= */
(function gsUniformExperience(){
  const themeFor=id=> id.startsWith('sea')?'sea':(id.startsWith('six')?'six':'flip');
  document.querySelectorAll('.modal').forEach(modal=>{
    const theme=themeFor(modal.id||'');
    modal.dataset.gameTheme=theme;
    const sheet=modal.querySelector('.sheet');
    if(sheet){
      sheet.classList.add('gs-unified-sheet');
      sheet.style.setProperty('--game-accent',theme==='sea'?'#6fe2df':theme==='six'?'#ffb51b':'#a83cff');
    }
  });
  // Etichette coerenti nelle finestre principali.
  const titles={
    historyModal:'Storico round',seaHistoryModal:'Storico round',six39HistoryModal:'Storico round',
    editPlayersModal:'Modifica giocatori',seaPlayersModal:'Modifica giocatori',seaEditModal:'Modifica giocatori',six39EditModal:'Modifica giocatori',
    hallModal:'🏆 Hall of Fame',seaHallModal:'🏆 Hall of Fame',six39HallModal:'🏆 Hall of Fame'
  };
  Object.entries(titles).forEach(([id,title])=>{
    const el=document.getElementById(id); if(!el)return;
    const h=el.querySelector('.sheet-head h2'); if(h)h.textContent=title;
  });
  // Micro-feedback uniforme su tutti i controlli cliccabili.
  document.addEventListener('pointerdown',e=>{
    const b=e.target.closest('button'); if(!b)return;
    b.animate([{transform:'scale(1)'},{transform:'scale(.975)'},{transform:'scale(1)'}],{duration:160,easing:'ease-out'});
  });
})();


/* =========================================================
   v54 — MOBILE / iPHONE INPUT & MODAL HARDENING
   ========================================================= */
(function mobileInputHardening(){
  function enhance(root=document){
    root.querySelectorAll('input').forEach(el=>{
      el.setAttribute('autocomplete','off');
      el.setAttribute('autocapitalize', el.type==='text' ? 'words' : 'off');
      el.setAttribute('enterkeyhint','done');
      if(el.type==='number'){
        el.setAttribute('inputmode','numeric');
        el.setAttribute('pattern','[0-9]*');
        el.setAttribute('min','0');
      }
    });
  }
  enhance();
  new MutationObserver(muts=>{
    for(const m of muts){
      for(const n of m.addedNodes){
        if(n.nodeType===1) enhance(n);
      }
    }
  }).observe(document.body,{childList:true,subtree:true});

  // Keep focused fields visible when the iPhone keyboard opens.
  document.addEventListener('focusin',e=>{
    if(e.target.matches('input,textarea,select')){
      setTimeout(()=>e.target.scrollIntoView({block:'center',behavior:'smooth'}),180);
    }
  });

  // Mark the page while a modal is visible to avoid background scroll jumps.
  const syncModalState=()=>{
    document.documentElement.classList.toggle(
      'gs-modal-open',
      !!document.querySelector('.modal:not(.hidden), .win-screen:not(.hidden)')
    );
  };
  new MutationObserver(syncModalState).observe(document.body,{attributes:true,subtree:true,attributeFilter:['class']});
  syncModalState();
})();



/* =========================================================
   v56 — RIPRENDI PARTITA / AUTOSAVE
   ========================================================= */
(function gsResumeManager(){
  const defs={
    flip7:{name:"Flip 7",icon:"7",accent:"#a84cff"},
    seasalt:{name:"Sea Salt & Paper",icon:"⛵",accent:"#72e2df"},
    sixnimmt:{name:"6... Le prendi!",icon:"🐂",accent:"#ffb52b"}
  };

  function snapshot(game){
    if(game==="flip7"){
      return {
        valid:!!state.players.length,
        active:!!state.players.length&&!state.resultRecorded,
        players:state.players,
        rounds:state.rounds.length,
        label:`Round ${state.rounds.length+1} · ${state.players.length} giocatori`
      };
    }
    if(game==="seasalt"){
      return {
        valid:!!seaState.players.length,
        active:!!seaState.players.length&&!seaState.finished,
        players:seaState.players,
        rounds:seaState.rounds.length,
        label:`Round ${seaState.rounds.length+1} · ${seaState.players.length} giocatori`
      };
    }
    return {
      valid:!!six39State.players.length,
      active:!!six39State.players.length&&!six39State.finished,
      players:six39State.players,
      rounds:six39State.rounds.length,
      label:`Round ${six39State.rounds.length+1} · ${six39State.players.length} giocatori`
    };
  }

  function meta(game){
    try{return gsSafeParse(localStorage.getItem(GS_META_PREFIX+game))||{}}catch(e){return{}}
  }

  function chooseLatest(){
    let preferred=null;
    try{preferred=localStorage.getItem(GS_LAST_ACTIVE_KEY)}catch(e){}
    if(preferred && snapshot(preferred).active)return preferred;

    return Object.keys(defs)
      .filter(g=>snapshot(g).active)
      .sort((a,b)=>(meta(b).updatedAt||0)-(meta(a).updatedAt||0))[0]||null;
  }

  function updateGameCards(){
    document.querySelectorAll("[data-home-game]").forEach(card=>{
      const g=card.dataset.homeGame==="6nimmt"?"sixnimmt":card.dataset.homeGame;
      const s=snapshot(g);
      const small=card.querySelector("small");
      const pill=card.querySelector(".home-play-btn,.play-pill");
      card.classList.toggle("has-saved-game",s.active);
      if(s.active){
        if(small)small.textContent=`${s.label} · salvata`;
        if(pill)pill.innerHTML='RIPRENDI <b>›</b>';
      }else{
        if(small)small.textContent="Segnapunti completo";
        if(pill)pill.innerHTML='GIOCA <b>›</b>';
      }
    });
  }

  window.renderResumeCenter=function(){
    updateGameCards();
    const box=document.getElementById("resumeCenter");
    const btn=document.getElementById("resumeMainBtn");
    if(!box||!btn)return;
    const game=chooseLatest();
    if(!game){
      box.classList.add("hidden");
      return;
    }
    const s=snapshot(game),d=defs[game];
    box.classList.remove("hidden");
    box.style.setProperty("--resume-accent",d.accent);
    document.getElementById("resumeGameIcon").textContent=d.icon;
    document.getElementById("resumeGameName").textContent=d.name;
    document.getElementById("resumeGameMeta").textContent=
      `${s.label} · ${s.players.slice(0,3).join(", ")}${s.players.length>3?"…":""}`;
    btn.onclick=()=>{
      gsTouchGame(game,game==="flip7"?state:game==="seasalt"?seaState:six39State,true);
      homeChooseGame(game);
    };
  };

  // Re-save the current state whenever Safari backgrounds/closes the page.
  function flush(){
    try{
      if(state.players.length)save();
      if(seaState.players.length)seaSave();
      if(six39State.players.length)six39Save();
    }catch(e){}
  }
  window.addEventListener("pagehide",flush);
  window.addEventListener("beforeunload",flush);
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")flush()});

  // When returning with Back/Forward cache, restore UI without losing state.
  window.addEventListener("pageshow",e=>{
    if(e.persisted){
      load();seaLoad();six39Load();
      window.renderResumeCenter();
    }
  });

  // First final refresh occurs after all three game loaders ran.
  setTimeout(window.renderResumeCenter,0);
})();



/* =========================================================
   v57 — FINE PARTITA PERFETTA
   ========================================================= */
function gsShowPerfectWin(id,theme){
  const screen=document.getElementById(id);
  if(!screen)return;
  screen.classList.remove("gs-force-closed");
  screen.hidden=false;
  screen.style.removeProperty("display");
  screen.style.removeProperty("visibility");
  screen.style.removeProperty("opacity");
  screen.style.removeProperty("pointer-events");
  screen.classList.remove("hidden");
  screen.classList.remove("showing","gs-win-enter");
  void screen.offsetWidth;
  screen.classList.add("showing","gs-win-enter");
  screen.dataset.winTheme=theme;
  document.documentElement.classList.add("gs-modal-open");

  try{
    if(navigator.vibrate)navigator.vibrate([45,35,80,40,130]);
  }catch(e){}

  // Re-trigger ranking reveal.
  screen.querySelectorAll(".final-row").forEach((row,i)=>{
    row.style.setProperty("--win-delay",`${310+i*95}ms`);
    row.classList.remove("gs-final-in");
    void row.offsetWidth;
    row.classList.add("gs-final-in");
  });

  // Hall confirmation appears after the trophy/title reveal.
  const confirm=screen.querySelector(".win-hall-confirm");
  if(confirm){
    confirm.classList.remove("gs-confirm-in");
    setTimeout(()=>confirm.classList.add("gs-confirm-in"),650);
  }
}
function gsHidePerfectWin(id){
  const screen=document.getElementById(id);
  if(screen){
    // V105: chiusura FORZATA. La schermata non può più restare sopra
    // alla Home/Hall anche se una vecchia classe/animazione prova a riattivarla.
    screen.classList.remove("showing","gs-win-enter");
    screen.classList.add("hidden","gs-force-closed");
    screen.hidden=true;
    screen.style.setProperty("display","none","important");
    screen.style.setProperty("visibility","hidden","important");
    screen.style.setProperty("opacity","0","important");
    screen.style.setProperty("pointer-events","none","important");
  }
  document.documentElement.classList.remove("gs-modal-open");
  document.body.classList.remove("gs-modal-open");
}
/* =========================================================
   v87 — CHIUSURA AUTOMATICA DELLA PARTITA CONCLUSA
   Il risultato resta nei Trofei, ma la partita terminata non
   resta più come partita corrente/riprendibile.
   ========================================================= */
let gsLastCompletedSnapshot={flip:null,sea:null,six:null};

function gsAutoArchiveCompletedGame(game){
  // Conserva solo in memoria i dati necessari alla schermata finale/rematch.
  // Il salvataggio persistente viene invece azzerato subito:
  // così la partita NON resta più tra quelle da riprendere.
  if(game==="flip" && state.players.length){
    gsLastCompletedSnapshot.flip=JSON.parse(JSON.stringify(state));
  }else if(game==="sea" && seaState.players.length){
    gsLastCompletedSnapshot.sea=JSON.parse(JSON.stringify(seaState));
  }else if(game==="six" && six39State.players.length){
    gsLastCompletedSnapshot.six=JSON.parse(JSON.stringify(six39State));
  }
  gsFinalizeCompletedGame(game);
}

function gsFinalizeCompletedGame(game){
  if(game==="flip"){
    // Il Trofeo è già stato registrato da recordResultIfNeeded().
    state={players:[],rounds:[],target:200,gameId:null,resultRecorded:false,turnIndex:0};
    save();
  }else if(game==="sea"){
    // Il Trofeo è già stato registrato da seaFinish().
    seaState={players:[],rounds:[],target:40,finished:false,winner:null,recorded:false,turnIndex:0};
    seaSave();
  }else if(game==="six"){
    // Il Trofeo è già stato registrato da six39RecordWin().
    six39State={players:[],rounds:[],finished:false,winner:null,recorded:false,turnIndex:0};
    six39Save();
  }
  window.renderResumeCenter?.();
}

function gsGameFromWinScreen(id){
  if(id==="winScreen")return "flip";
  if(id==="seaWinScreen")return "sea";
  if(id==="six39WinScreen")return "six";
  return null;
}

function gsHomeAfterWin(id){
  gsHidePerfectWin(id);

  document.getElementById("hallModal")?.classList.add("hidden");
  document.getElementById("seaHallModal")?.classList.add("hidden");
  document.getElementById("six39HallModal")?.classList.add("hidden");

  hideAllGameWorlds();
  const home=document.getElementById("homeScreen");
  if(home){
    home.classList.remove("hidden");
    home.hidden=false;
    home.style.removeProperty("display");
  }

  window.renderResumeCenter?.();
  window.scrollTo({top:0,behavior:"smooth"});
}

function gsHallAfterWin(id,game){
  gsHidePerfectWin(id);

  // Resta nel mondo del gioco e apre la Hall sopra di esso.
  if(game==="flip"){
    document.getElementById("flip7App")?.classList.remove("hidden");
    renderHall();
    const m=document.getElementById("hallModal");
    if(m){m.classList.remove("hidden");m.hidden=false}
  }else if(game==="sea"){
    document.getElementById("seaSaltWorld")?.classList.remove("hidden");
    seaRenderHall();
    const m=document.getElementById("seaHallModal");
    if(m){m.classList.remove("hidden");m.hidden=false}
  }else{
    document.getElementById("sixNimmtWorld")?.classList.remove("hidden");
    six39RenderHall();
    const m=document.getElementById("six39HallModal");
    if(m){m.classList.remove("hidden");m.hidden=false}
  }
}

if(document.getElementById("flipHomeAfterWin"))document.getElementById("flipHomeAfterWin").onclick=()=>gsHomeAfterWin("winScreen");
if(document.getElementById("flipHallAfterWin"))document.getElementById("flipHallAfterWin").onclick=()=>gsHallAfterWin("winScreen","flip");
if(document.getElementById("seaHomeAfterWin"))document.getElementById("seaHomeAfterWin").onclick=()=>gsHomeAfterWin("seaWinScreen");
if(document.getElementById("seaHallAfterWin"))document.getElementById("seaHallAfterWin").onclick=()=>gsHallAfterWin("seaWinScreen","sea");
if(document.getElementById("sixHomeAfterWin"))document.getElementById("sixHomeAfterWin").onclick=()=>gsHomeAfterWin("six39WinScreen");
if(document.getElementById("sixHallAfterWin"))document.getElementById("sixHallAfterWin").onclick=()=>gsHallAfterWin("six39WinScreen","six");

// New game actions retain the same game world instead of bouncing to home.
if(document.getElementById("seaNewGame"))document.getElementById("seaNewGame").onclick=()=>{
  gsHidePerfectWin("seaWinScreen");
  seaState={players:[],rounds:[],target:40,finished:false,winner:null,recorded:false,turnIndex:0};
  seaSave();
  $("#homeScreen").classList.add("hidden");
  hideAllGameWorlds();
  $("#seaSaltWorld").classList.remove("hidden");
  seaOpenInlineSetup(false);
};
if(document.getElementById("six39NewGame"))document.getElementById("six39NewGame").onclick=()=>{
  gsHidePerfectWin("six39WinScreen");
  six39State={players:[],rounds:[],finished:false,winner:null,recorded:false,turnIndex:0};
  six39Save();
  $("#homeScreen").classList.add("hidden");
  hideAllGameWorlds();
  $("#sixNimmtWorld").classList.remove("hidden");
  six39OpenSetup(false);
};



/* =========================================================
   GAME SCORE v59 — ONLINE + QR + HOST/SPECTATOR
   ========================================================= */
(function gsOnline(){
  const CFG=window.GS_ONLINE_CONFIG||{};
  const ROOM_STORAGE="gs:online-room-v1:";
  let client=null;
  let spectatorChannel=null;
  let spectatorCode=null;
  let onlineBusy=false;

  const configured=()=>Boolean(
    CFG.SUPABASE_URL &&
    CFG.SUPABASE_PUBLISHABLE_KEY &&
    window.supabase?.createClient
  );

  function getClient(){
    if(client)return client;
    if(!configured())return null;
    client=window.supabase.createClient(
      CFG.SUPABASE_URL,
      CFG.SUPABASE_PUBLISHABLE_KEY,
      {auth:{persistSession:false,autoRefreshToken:false}}
    );
    return client;
  }

  function randomSecret(){
    const bytes=new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return [...bytes].map(b=>b.toString(16).padStart(2,"0")).join("");
  }

  function currentGame(){
    if(!document.getElementById("flip7App")?.classList.contains("hidden"))return "flip7";
    if(!document.getElementById("seaSaltWorld")?.classList.contains("hidden"))return "seasalt";
    if(!document.getElementById("sixNimmtWorld")?.classList.contains("hidden"))return "sixnimmt";
    return null;
  }

  function currentState(game){
    if(game==="flip7")return state;
    if(game==="seasalt")return seaState;
    if(game==="sixnimmt")return six39State;
    return null;
  }

  function gameHasPlayers(game){
    const s=currentState(game);
    return !!(s && Array.isArray(s.players) && s.players.length);
  }

  function roomKey(game){return ROOM_STORAGE+game}

  function loadRoom(game){
    try{return JSON.parse(localStorage.getItem(roomKey(game))||"null")}catch(e){return null}
  }
  function saveRoom(game,room){
    try{localStorage.setItem(roomKey(game),JSON.stringify(room))}catch(e){}
  }
  function clearRoom(game){
    try{localStorage.removeItem(roomKey(game))}catch(e){}
  }

  function appBase(){
    const fixed=String(CFG.APP_PUBLIC_URL||"").trim().replace(/\/+$/,"");
    if(fixed)return fixed;
    return location.origin && location.origin!=="null"
      ? location.origin+location.pathname.replace(/\/[^/]*$/,"")
      : location.href.split("?")[0].replace(/\/index\.html$/,"");
  }

  function spectatorUrl(code){
    return `${appBase()}/?room=${encodeURIComponent(code)}`;
  }

  function setStatus(text,ok=true){
    const dot=document.getElementById("gsOnlineStatusDot");
    const label=document.getElementById("gsOnlineStatusText");
    if(label)label.textContent=text;
    if(dot)dot.classList.toggle("bad",!ok);
  }


  function gsHallSnapshot(game){
    try{
      let games=0, source={};
      if(game==="flip7"){const h=loadHall()||{};games=Number(h.totalGames||0);source=h.players||{}}
      else if(game==="seasalt"){const h=seaHallLoad()||{};games=Number(h.games||0);source=h.players||{}}
      else if(game==="sixnimmt"){const h=six39HallLoad()||{};games=Number(h.games||0);source=h.players||{}}
      const players=Object.values(source).map(p=>{
        const wins=Number(p?.wins||0),g=Number(p?.games||0);
        const best=game==="flip7"?(p?.bestScore??p?.best??null):(p?.best??p?.bestScore??null);
        return {
          name:String(p?.name||"Giocatore"),
          wins,
          games:g,
          rate:g?Math.round(wins/g*100):0,
          lastWin:p?.lastWin||null,
          best,
          podiums:Math.max(Number(p?.podiums||0),wins),
          topGame:typeof gsTopGameForPlayer==="function"?gsTopGameForPlayer(p?.name):"—"
        };
      }).sort((a,b)=>b.wins-a.wins||b.rate-a.rate||b.games-a.games||a.name.localeCompare(b.name,"it"));
      return {games,players,updatedAt:new Date().toISOString()};
    }catch(e){return {games:0,players:[],updatedAt:null}}
  }
  function gsOnlineState(game){
    const src=currentState(game)||{};
    let payload;
    try{payload=structuredClone(src)}catch(e){payload=JSON.parse(JSON.stringify(src))}
    payload.__hall=gsHallSnapshot(game);
    return payload;
  }

  const HOST_RESUME_KEY="gs:host-resume-code-v1";

  function normalizeHostCode(v){
    const raw=String(v||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,10);
    return raw.length>8 ? `${raw.slice(0,4)}-${raw.slice(4,8)}-${raw.slice(8)}` :
           raw.length>4 ? `${raw.slice(0,4)}-${raw.slice(4)}` : raw;
  }
  function hostCodeRaw(v){return String(v||"").toUpperCase().replace(/[^A-Z0-9]/g,"")}
  function randomHostCode(){
    const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const b=new Uint8Array(10);crypto.getRandomValues(b);
    return normalizeHostCode([...b].map(x=>alphabet[x%alphabet.length]).join(""));
  }
  function loadHostResumeCode(){
    try{return normalizeHostCode(localStorage.getItem(HOST_RESUME_KEY)||"")}catch(e){return""}
  }
  function saveHostResumeCode(code){
    code=normalizeHostCode(code);
    if(hostCodeRaw(code).length<8)throw new Error("Il Codice Host deve contenere almeno 8 caratteri.");
    localStorage.setItem(HOST_RESUME_KEY,code);
    return code;
  }
  function ensureHostResumeCode(){
    let code=loadHostResumeCode();
    if(!code){code=randomHostCode();saveHostResumeCode(code)}
    return code;
  }

  async function bindExistingRoom(game){
    const sb=getClient(),room=loadRoom(game);
    if(!sb||!room?.joinCode||!room?.hostSecret)return false;
    const code=ensureHostResumeCode();
    const {error}=await sb.rpc("gs_bind_host_resume",{
      p_join_code:room.joinCode,
      p_host_secret:room.hostSecret,
      p_host_resume_code:code
    });
    if(error){
      console.warn("Bind Codice Host:",error);
      return false;
    }
    return true;
  }

  async function createRoom(game){
    const sb=getClient();
    if(!sb)throw new Error("Supabase non configurato");
    const existing=loadRoom(game);
    if(existing?.joinCode && existing?.hostSecret){
      await bindExistingRoom(game).catch(()=>{});
      return existing;
    }

    const hostSecret=randomSecret();
    const hostResumeCode=ensureHostResumeCode();
    const payload=gsOnlineState(game);
    const {data,error}=await sb.rpc("gs_create_room",{
      p_game_type:game,
      p_state:payload,
      p_host_secret:hostSecret,
      p_host_resume_code:hostResumeCode
    });
    if(error)throw error;
    const joinCode=typeof data==="string"?data:data?.join_code||data?.joinCode;
    if(!joinCode)throw new Error("Codice partita non ricevuto");
    const room={joinCode,hostSecret,game};
    saveRoom(game,room);
    return room;
  }

  async function pushRoom(game,closed=false){
    const sb=getClient();
    const room=loadRoom(game);
    if(!sb||!room?.joinCode||!room?.hostSecret)return;
    const payload=gsOnlineState(game);
    const {error}=await sb.rpc("gs_update_room",{
      p_join_code:room.joinCode,
      p_host_secret:room.hostSecret,
      p_state:payload,
      p_closed:closed
    });
    if(error){
      console.warn("GAME SCORE online sync:",error);
      setStatus("Errore sincronizzazione",false);
      return;
    }

    // Fast live update to spectators. Initial/recovery state still comes from the DB RPC.
    try{
      const channel=sb.channel(`gs-room-${room.joinCode}`);
      await channel.subscribe();
      await channel.send({
        type:"broadcast",
        event:"state",
        payload:{game_type:game,state:payload,closed}
      });
      await sb.removeChannel(channel);
    }catch(e){
      console.warn("Broadcast:",e);
    }
    setStatus(closed?"Partita chiusa":"Sincronizzato");
  }

  // Called by the wrapped local save methods.
  window.gsOnlineMaybePush=function(game,data){
    const room=loadRoom(game);
    if(!room)return;
    const noPlayers=!(data?.players?.length);
    const completed =
      (game==="flip7" && data?.resultRecorded===true) ||
      (game==="seasalt" && data?.finished===true) ||
      (game==="sixnimmt" && data?.finished===true);
    const closed=noPlayers || completed;
    clearTimeout(window.__gsOnlinePushTimer);
    window.__gsOnlinePushTimer=setTimeout(async()=>{
      await pushRoom(game,closed);
      if(closed)clearRoom(game);
    },120);
  };

  function qrRender(url){
    const box=document.getElementById("gsQrBox");
    if(!box)return;
    box.innerHTML="";
    if(window.QRCode){
      new window.QRCode(box,{
        text:url,
        width:220,
        height:220,
        colorDark:"#090914",
        colorLight:"#ffffff",
        correctLevel:window.QRCode.CorrectLevel.M
      });
    }else{
      box.innerHTML=`<div class="gs-qr-fallback">QR non caricato.<br><small>Usa “Copia link”.</small></div>`;
    }
  }

  async function openShare(){
    const game=currentGame();
    if(!game || !gameHasPlayers(game))return;
    const modal=document.getElementById("gsShareModal");
    modal?.classList.remove("hidden");

    const noCfg=document.getElementById("gsOnlineNotConfigured");
    const ready=document.getElementById("gsOnlineShareReady");
    if(!configured()){
      noCfg?.classList.remove("hidden");
      ready?.classList.add("hidden");
      return;
    }
    noCfg?.classList.add("hidden");
    ready?.classList.remove("hidden");

    if(onlineBusy)return;
    onlineBusy=true;
    setStatus("Creazione stanza…");
    try{
      const room=await createRoom(game);
      const url=spectatorUrl(room.joinCode);
      document.getElementById("gsRoomCode").textContent=room.joinCode;
      document.getElementById("gsSpectatorUrl").value=url;
      const hostCode=ensureHostResumeCode();
      const hostCodeEl=document.getElementById("gsHostResumeCode");
      if(hostCodeEl)hostCodeEl.textContent=hostCode;
      qrRender(url);
      await bindExistingRoom(game).catch(()=>{});
      await pushRoom(game,false);
      setStatus("Online · giocatori possono entrare");
    }catch(e){
      console.error(e);
      setStatus("Impossibile creare la stanza",false);
      alert("GAME SCORE Online: "+(e.message||e));
    }finally{
      onlineBusy=false;
    }
  }

  function updateShareButton(){
    const btn=document.getElementById("gsShareRoomBtn");
    const game=currentGame();
    const spectator=new URLSearchParams(location.search).has("room");
    if(!btn)return;
    btn.classList.toggle("hidden",spectator || !game || !gameHasPlayers(game));
  }


  // -------- HOST MULTI-DISPOSITIVO --------
  const hostGameNames={flip7:"Flip 7",seasalt:"Sea Salt & Paper",sixnimmt:"6... Le prendi!"};

  function onlineStateIsActive(game,s,closed){
    if(closed||!s||!Array.isArray(s.players)||!s.players.length)return false;
    if(game==="flip7")return !s.resultRecorded;
    return !s.finished;
  }

  function stripOnlineMeta(s){
    const out=JSON.parse(JSON.stringify(s||{}));
    delete out.__hall;
    return out;
  }

  function restoreHallFromOnline(game,hall){
    if(!hall||!Array.isArray(hall.players))return;
    try{
      const players={};
      hall.players.forEach(p=>{
        const key=String(p.name||"").trim().toLocaleLowerCase("it");
        if(key)players[key]={
          name:p.name,wins:Number(p.wins||0),games:Number(p.games||0),lastWin:p.lastWin||null,
          podiums:Math.max(Number(p.podiums||0),Number(p.wins||0)),
          best:p.best??null,bestScore:p.best??null
        };
      });
      if(game==="flip7")saveHall({totalGames:Number(hall.games||0),players});
      else if(game==="seasalt")seaHallSave({games:Number(hall.games||0),players});
      else six39HallSave({games:Number(hall.games||0),players});
    }catch(e){console.warn("Ripristino Hall:",e)}
  }

  async function findHostRooms(code){
    const sb=getClient();
    if(!sb)throw new Error("Supabase non configurato");
    code=normalizeHostCode(code||loadHostResumeCode());
    if(hostCodeRaw(code).length<8)return [];
    const {data,error}=await sb.rpc("gs_find_host_rooms",{p_host_resume_code:code});
    if(error)throw error;
    return (Array.isArray(data)?data:[])
      .filter(r=>onlineStateIsActive(r.game_type,r.state,!!r.closed))
      .sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at));
  }

  function hostRoomCard(r,compact=false){
    const s=r.state||{},players=Array.isArray(s.players)?s.players:[];
    const rounds=Array.isArray(s.rounds)?s.rounds.length:0;
    const game=String(r.game_type||"");
    const accent=game==="seasalt"?"#72e2df":game==="sixnimmt"?"#ffb52b":"#a84cff";
    return `<button class="gs-host-room-card" data-host-room="${esc(r.join_code)}" style="--host-accent:${accent}">
      <div class="gs-host-room-icon">${game==="seasalt"?"⛵":game==="sixnimmt"?"🐂":"7"}</div>
      <div class="gs-host-room-copy">
        <strong>${esc(hostGameNames[game]||game)}</strong>
        <span>Round ${rounds+1} · ${players.length} giocatori</span>
        <small>${players.slice(0,4).map(esc).join(" · ")}${players.length>4?"…":""}</small>
      </div>
      <div class="gs-host-room-action">CONTINUA <b>›</b></div>
    </button>`;
  }

  async function refreshHostCloudUI(){
    const home=document.getElementById("gsCloudHostCenter");
    const roomsBox=document.getElementById("gsCloudHostRooms");
    const modalRooms=document.getElementById("gsHostResumeRooms");
    const code=loadHostResumeCode();

    if(!code){
      if(home){
        home.classList.remove("hidden");
        document.getElementById("gsCloudHostTitle").textContent="Riprendi una partita da un altro dispositivo";
        document.getElementById("gsCloudHostText").textContent="Collega una volta il tuo Codice Host personale.";
        roomsBox.innerHTML='<button class="gs-cloud-connect" data-open-host-resume>COLLEGA HOST ONLINE <b>›</b></button>';
      }
      if(modalRooms)modalRooms.innerHTML="";
      return [];
    }

    try{
      const rooms=await findHostRooms(code);
      if(home){
        home.classList.remove("hidden");
        document.getElementById("gsCloudHostTitle").textContent=rooms.length?"Partite online in corso":"Host online collegato";
        document.getElementById("gsCloudHostText").textContent=rooms.length
          ?"Puoi continuare anche se la partita è stata creata su un altro dispositivo."
          :"Nessuna partita online in corso.";
        roomsBox.innerHTML=rooms.length?rooms.slice(0,3).map(r=>hostRoomCard(r,true)).join("")
          :'<div class="gs-cloud-empty">✓ Questo dispositivo è collegato al tuo Host personale.</div>';
      }
      if(modalRooms)modalRooms.innerHTML=rooms.length?rooms.map(r=>hostRoomCard(r)).join("")
        :'<div class="gs-host-no-rooms">Nessuna partita online attiva trovata.</div>';
      bindHostRoomButtons(rooms);
      return rooms;
    }catch(e){
      console.warn("Ricerca partite Host:",e);
      if(home){
        home.classList.remove("hidden");
        document.getElementById("gsCloudHostTitle").textContent="Host online";
        document.getElementById("gsCloudHostText").textContent="Esegui prima l'aggiornamento SQL V84 su Supabase.";
        roomsBox.innerHTML='<button class="gs-cloud-connect" data-open-host-resume>APRI HOST ONLINE <b>›</b></button>';
      }
      if(modalRooms)modalRooms.innerHTML=`<div class="gs-host-no-rooms">⚠ ${esc(e.message||String(e))}</div>`;
      return [];
    }
  }

  function bindHostRoomButtons(rooms){
    const byCode=new Map((rooms||[]).map(r=>[String(r.join_code),r]));
    document.querySelectorAll("[data-host-room]").forEach(btn=>{
      btn.onclick=()=>claimHostRoom(byCode.get(btn.dataset.hostRoom));
    });
    document.querySelectorAll("[data-open-host-resume]").forEach(btn=>{
      btn.onclick=()=>openHostResumeModal();
    });
  }

  function openHostResumeModal(){
    const modal=document.getElementById("gsHostResumeModal");
    const input=document.getElementById("gsHostResumeInput");
    if(input)input.value=loadHostResumeCode();
    modal?.classList.remove("hidden");
    refreshHostCloudUI();
  }

  async function claimHostRoom(row){
    if(!row)return;
    const sb=getClient();
    const code=loadHostResumeCode();
    if(!sb||!code)return;
    const status=document.getElementById("gsHostResumeStatus");
    if(status)status.textContent="Recupero della partita in corso…";
    const newSecret=randomSecret();
    try{
      const {data,error}=await sb.rpc("gs_claim_host_room",{
        p_join_code:row.join_code,
        p_host_resume_code:code,
        p_new_host_secret:newSecret
      });
      if(error)throw error;
      const claimed=Array.isArray(data)?data[0]:data;
      if(!claimed)throw new Error("Partita non trovata.");
      const game=claimed.game_type;
      const online=claimed.state||{};
      restoreHallFromOnline(game,online.__hall);
      const clean=stripOnlineMeta(online);

      saveRoom(game,{joinCode:claimed.join_code,hostSecret:newSecret,game});

      if(game==="flip7"){
        state=clean; save();
      }else if(game==="seasalt"){
        seaState=clean; seaSave();
      }else{
        six39State=clean; six39Save();
      }

      document.getElementById("gsHostResumeModal")?.classList.add("hidden");
      window.renderResumeCenter?.();
      homeChooseGame(game);
      setStatus("Host trasferito su questo dispositivo");
    }catch(e){
      console.error(e);
      if(status)status.textContent="⚠ "+(e.message||String(e));
    }
  }

  async function saveHostCodeFromModal(){
    const input=document.getElementById("gsHostResumeInput");
    const status=document.getElementById("gsHostResumeStatus");
    try{
      const code=saveHostResumeCode(input?.value||"");
      if(input)input.value=code;
      if(status)status.textContent="✓ Dispositivo collegato. Cerco le tue partite…";
      await refreshHostCloudUI();
    }catch(e){
      if(status)status.textContent="⚠ "+(e.message||String(e));
    }
  }

  // -------- SPECTATOR --------
  function spectatorTheme(game){
    if(game==="seasalt")return {name:"Sea Salt & Paper",accent:"#6fe2df",goal:"Punti"};
    if(game==="sixnimmt")return {name:"6... Le prendi!",accent:"#ffb51b",goal:"66+"};
    return {name:"Flip 7",accent:"#a84cff",goal:"200"};
  }
  function totalsFor(game,s){
    return (s.players||[]).map((_,i)=>(s.rounds||[]).reduce((sum,r)=>sum+(Number(r?.[i])||0),0));
  }

  let spectatorHallState={game:null,hall:null};
  let spectatorWinShownKey="";
  let spectatorWinTimer=null;

  function gsSpectatorRenderHall(game,hall){
    spectatorHallState={game,hall:hall||{games:0,players:[]}};
    const theme=spectatorTheme(game);
    const players=Array.isArray(hall?.players)?hall.players:[];
    gsSetTrophyCount("gsSpectatorHallLeaderWins",gsHallMaxWinsFromPlayers(players));
    document.getElementById("gsSpectatorHallTitle").textContent=`Classifica generale · ${theme.name}`;
    document.getElementById("gsSpectatorHallSubtitle").textContent="Vittorie accumulate nel tempo dal gruppo";
    document.getElementById("gsSpectatorHallSummary").innerHTML=`
      <div><strong>${Number(hall?.games||0)}</strong><span>PARTITE</span></div>
      <div><strong>${players.length}</strong><span>GIOCATORI</span></div>
      <div><strong>${players.reduce((n,p)=>n+Number(p.wins||0),0)}</strong><span>VITTORIE</span></div>`;
    document.getElementById("gsSpectatorHallRows").innerHTML=players.length?players.map((p,i)=>`
      <button class="gs-hall-row gs-hall-row-clickable ${i===0?"leader":""}" type="button" data-spectator-profile="${i}">
        <div class="gs-hall-pos">${i===0?"🥇":i===1?"🥈":i===2?"🥉":`${i+1}°`}</div>
        <div class="gs-hall-name">
          <strong>${esc(p.name)}</strong>
          <span>${p.games} partite · ${p.rate}% vittorie · ${Math.max(Number(p.podiums||0),Number(p.wins||0))} podi</span>
        </div>
        <div class="gs-hall-wins"><strong>${p.wins}</strong><span>🏆</span></div>
        <span class="gs-hall-open-profile">›</span>
      </button>`).join(""):`<div class="gs-hall-empty">La prima vittoria comparirà qui automaticamente.</div>`;

    document.querySelectorAll("#gsSpectatorHallRows [data-spectator-profile]").forEach(btn=>{
      btn.onclick=()=>gsSpectatorOpenProfile(Number(btn.dataset.spectatorProfile));
    });
  }

  function gsSpectatorDate(iso){
    if(!iso)return "Nessuna vittoria registrata";
    try{
      return new Intl.DateTimeFormat("it-IT",{day:"numeric",month:"long",year:"numeric"}).format(new Date(iso));
    }catch(e){return "Data non disponibile"}
  }

  function gsSpectatorOpenProfile(index){
    const hall=spectatorHallState?.hall||{};
    const players=Array.isArray(hall.players)?hall.players:[];
    const p=players[index];
    if(!p)return;

    const theme=spectatorTheme(spectatorHallState.game);
    const rank=index+1;
    const medal=rank===1?"🥇":rank===2?"🥈":rank===3?"🥉":"🏅";
    const best=(p.best===null||p.best===undefined||p.best==="")?"—":p.best;
    const podiums=Math.max(Number(p.podiums||0),Number(p.wins||0));

    document.querySelector("#gsSpectatorProfileModal .gs-spectator-profile-card")
      ?.style.setProperty("--profile-accent",theme.accent);

    document.getElementById("gsSpectatorProfileName").textContent=String(p.name||"Giocatore").toUpperCase();
    document.getElementById("gsSpectatorProfileMedal").textContent=medal;
    document.getElementById("gsSpectatorProfileRank").textContent=`#${rank} nella Hall of Fame`;
    document.getElementById("gsSpectatorProfileSubtitle").textContent=`Statistiche personali · ${theme.name}`;
    document.getElementById("gsSpectatorProfileWins").textContent=Number(p.wins||0);
    document.getElementById("gsSpectatorProfileGames").textContent=Number(p.games||0);
    document.getElementById("gsSpectatorProfileRate").textContent=`${Number(p.rate||0)}%`;
    document.getElementById("gsSpectatorProfileBest").textContent=best;
    document.getElementById("gsSpectatorProfilePodiums").textContent=podiums;
    document.getElementById("gsSpectatorProfileTopGame").textContent=p.topGame||theme.name||"—";
    document.getElementById("gsSpectatorProfileLastWin").textContent=gsSpectatorDate(p.lastWin);

    document.getElementById("gsSpectatorHallModal")?.classList.add("hidden");
    document.getElementById("gsSpectatorProfileModal")?.classList.remove("hidden");
  }

  function gsSpectatorCloseProfile(backToHall=false){
    document.getElementById("gsSpectatorProfileModal")?.classList.add("hidden");
    if(backToHall)document.getElementById("gsSpectatorHallModal")?.classList.remove("hidden");
  }

  function gsSpectatorWinner(game,s,totals,target){
    if(game==="seasalt"&&s.finished&&s.winner!==null&&s.winner!==undefined){
      const i=Number(s.winner); return {names:[s.players[i]],score:totals[i]||0,unit:"PUNTI"};
    }
    if(game==="sixnimmt"&&s.finished&&s.winner!==null&&s.winner!==undefined){
      const i=Number(s.winner); return {names:[s.players[i]],score:totals[i]||0,unit:"TESTE DI BUE"};
    }
    if(game==="flip7"&&(s.rounds||[]).length&&totals.some(v=>v>=target)){
      const max=Math.max(...totals), names=s.players.filter((_,i)=>totals[i]===max);
      return {names,score:max,unit:"PUNTI"};
    }
    return null;
  }
  function gsOrdinalIt(n){
    n=Math.max(1,Number(n||1));
    return `${n}ª`;
  }

  function gsSpectatorWinnerHistory(winner){
    const hall=spectatorHallState?.hall;
    const players=Array.isArray(hall?.players)?hall.players:[];
    const wanted=(winner?.names||[]).map(n=>String(n||"").trim().toLocaleLowerCase("it"));
    const found=players.filter(p=>wanted.includes(String(p?.name||"").trim().toLocaleLowerCase("it")));
    const wins=found.length?Math.max(...found.map(p=>Number(p?.wins||0))):0;
    const leaderWins=players.length?Math.max(...players.map(p=>Number(p?.wins||0))):0;
    return {wins,leaderWins,isHistoricalLeader:wins>0&&wins===leaderWins};
  }

  function gsSpectatorCelebrate(game,winner,roundCount){
    if(!winner)return;
    const key=`${spectatorCode||"room"}:${game}:${winner.names.join("|")}:${winner.score}:${roundCount}`;
    if(spectatorWinShownKey===key)return;
    spectatorWinShownKey=key;

    const overlay=document.getElementById("gsSpectatorWinOverlay");
    const theme=spectatorTheme(game);
    const hist=gsSpectatorWinnerHistory(winner);
    const gameNames={flip7:"FLIP 7",seasalt:"SEA SALT & PAPER",sixnimmt:"6… LE PRENDI!"};

    overlay.style.setProperty("--win-accent",theme.accent);
    overlay.dataset.winGame=game;

    document.getElementById("gsSpectatorWinGame").textContent=gameNames[game]||theme.name;
    document.getElementById("gsSpectatorWinName").textContent=
      winner.names.length>1
        ? `${winner.names.map(x=>String(x).toUpperCase()).join(" & ")} VINCONO!`
        : `${String(winner.names[0]||"").toUpperCase()} VINCE!`;

    document.getElementById("gsSpectatorWinScore").textContent=winner.score;
    document.getElementById("gsSpectatorWinUnit").textContent=winner.unit;

    const history=document.getElementById("gsSpectatorWinHistory");
    const leader=document.getElementById("gsSpectatorWinLeader");
    if(hist.wins>0){
      history.innerHTML=`<span>🏆</span><strong>${gsOrdinalIt(hist.wins)} vittoria in classifica generale</strong>`;
      leader.textContent=hist.isHistoricalLeader
        ? `👑 Leader storico · ${hist.wins} ${hist.wins===1?"vittoria":"vittorie"}`
        : `Hall of Fame · ${hist.wins} ${hist.wins===1?"vittoria":"vittorie"}`;
    }else{
      history.innerHTML=`<span>🏆</span><strong>Vittoria registrata nella Hall of Fame</strong>`;
      leader.textContent="";
    }

    // Piccolo ritardo: lascia finire l'aggiornamento del totale/classifica
    // prima di occupare tutto lo schermo con la celebrazione.
    clearTimeout(spectatorWinTimer);
    spectatorWinTimer=setTimeout(()=>{
      overlay.classList.remove("hidden","soft-exit");
      void overlay.offsetWidth;
      overlay.classList.add("play");
      gsPlaySound("win");
      try{navigator.vibrate?.([100,50,140,50,190])}catch(e){}

      // Finale più importante: resta visibile 10 secondi.
      spectatorWinTimer=setTimeout(()=>{
        overlay.classList.add("soft-exit");
        setTimeout(()=>{
          overlay.classList.add("hidden");
          overlay.classList.remove("play","soft-exit");
        },700);
      },10000);
    },1850);
  }
  function gsSpectatorCloseHall(){
    document.getElementById("gsSpectatorHallModal")?.classList.add("hidden");
    document.getElementById("gsSpectatorProfileModal")?.classList.add("hidden");
  }
  function gsSpectatorCloseWin(){
    clearTimeout(spectatorWinTimer);
    const el=document.getElementById("gsSpectatorWinOverlay");
    el?.classList.add("hidden");
    el?.classList.remove("play","soft-exit");
  }


  // V91 — sequenza ospite del nuovo round:
  // 1) mostra il punteggio del round per 1,5s mantenendo classifica/totali precedenti
  // 2) aggiorna i totali
  // 3) se cambia l'ordine, parte la già esistente animazione FLIP della classifica.
  let gsSpectatorRenderedSnapshot=null;
  let gsSpectatorRoundTimer=null;
  let gsSpectatorPendingPayload=null;
  let gsSpectatorRoundSequenceActive=false;

  function gsSpectatorClone(v){
    try{return JSON.parse(JSON.stringify(v))}catch(e){return v}
  }

  function gsSpectatorRoundCount(s){
    return Array.isArray(s?.rounds)?s.rounds.length:0;
  }

  function gsSpectatorSamePlayers(a,b){
    const ap=Array.isArray(a?.players)?a.players:[];
    const bp=Array.isArray(b?.players)?b.players:[];
    if(ap.length!==bp.length)return false;
    return ap.every((p,i)=>{
      const an=typeof p==="object"?String(p?.name||p?.label||p?.playerName||""):String(p??"");
      const bn=typeof bp[i]==="object"?String(bp[i]?.name||bp[i]?.label||bp[i]?.playerName||""):String(bp[i]??"");
      return an===bn;
    });
  }

  function gsSpectatorShouldAnimateRound(game,next){
    const prev=gsSpectatorRenderedSnapshot;
    if(!prev||!gsSpectatorSamePlayers(prev,next))return false;
    const before=gsSpectatorRoundCount(prev);
    const after=gsSpectatorRoundCount(next);
    return after===before+1 && after>0;
  }

  function gsSpectatorShowRoundDelta(next){
    const round=next?.rounds?.at?.(-1) || next?.rounds?.[next.rounds.length-1] || [];
    document.querySelectorAll("#gsSpectatorRanking [data-gs-player-key]").forEach(card=>{
      const i=Number(card.dataset.gsPlayerKey);
      const value=Number(round?.[i]||0);
      const score=card.querySelector(".gs-live-score");
      if(!score)return;

      const bubble=document.createElement("div");
      bubble.className="gs-round-delta";
      bubble.innerHTML=`<span>ROUND</span><strong>${value>=0?"+":""}${value}</strong>`;
      score.appendChild(bubble);
      requestAnimationFrame(()=>bubble.classList.add("show"));
    });
  }

  function gsSpectatorReceiveState(game,s,closed=false){
    const payload={game,state:gsSpectatorClone(s),closed:!!closed};

    // Se arriva un altro update mentre è in corso la presentazione del round,
    // conserviamo l'ultimo e lo applichiamo dopo.
    if(gsSpectatorRoundSequenceActive){
      gsSpectatorPendingPayload=payload;
      return;
    }

    if(gsSpectatorShouldAnimateRound(game,s)){
      gsSpectatorRoundSequenceActive=true;

      // La classifica resta ancora con i valori del round precedente.
      // Sopra quei valori compare il +N del nuovo round.
      gsSpectatorShowRoundDelta(s);

      clearTimeout(gsSpectatorRoundTimer);
      gsSpectatorRoundTimer=setTimeout(()=>{
        gsSpectatorRoundSequenceActive=false;

        // Ora aggiorniamo il totale. renderSpectator conserva le vecchie
        // coordinate e quindi l'eventuale sorpasso parte SUBITO DOPO.
        renderSpectator(game,s,closed);

        if(gsSpectatorPendingPayload){
          const pending=gsSpectatorPendingPayload;
          gsSpectatorPendingPayload=null;
          setTimeout(()=>gsSpectatorReceiveState(pending.game,pending.state,pending.closed),80);
        }
      },1500);
      return;
    }

    renderSpectator(game,s,closed);
  }

  function renderSpectator(game,s,closed=false){
    const theme=spectatorTheme(game);
    const app=document.getElementById("gsSpectatorApp");
    app.style.setProperty("--spectator-accent",theme.accent);
    app.dataset.spectatorGame=game;
    document.getElementById("gsSpectatorGameTitle").textContent=theme.name;

    const totals=totalsFor(game,s);
    const round=(s.rounds?.length||0)+1;
    const target=
      game==="flip7"?(s.target||200):
      game==="seasalt"?(s.target||40):67;

    document.getElementById("gsSpectatorRound").textContent=round;
    const _stn=document.getElementById("gsSpectatorTurnName"); if(_stn)_stn.textContent=gsTurnName(s);
    document.getElementById("gsSpectatorGoal").textContent=
      game==="sixnimmt"?"66":target;
    document.getElementById("gsSpectatorMeta").textContent=
      `${s.players?.length||0} giocatori · ${closed?"Partita conclusa":"Aggiornamento in tempo reale"}`;

    gsSpectatorRenderHall(game,s.__hall||{games:0,players:[]});
    const gsWinner=gsSpectatorWinner(game,s,totals,target);
    if(gsWinner)gsSpectatorCelebrate(game,gsWinner,(s.rounds||[]).length);

    let order=(s.players||[]).map((name,i)=>({name,i,total:totals[i]||0}));
    if(game==="sixnimmt")order.sort((a,b)=>a.total-b.total||a.i-b.i);
    else order.sort((a,b)=>b.total-a.total||a.i-b.i);

    const last=s.rounds?.length ? s.rounds.at(-1) : Array((s.players||[]).length).fill(0);
    const allEqual=order.length ? order.every(x=>x.total===order[0].total) : true;
    const ranking=document.getElementById("gsSpectatorRanking");

    // V86 — FLIP animation: remember each player's on-screen position
    // before the ranking order changes.
    const gsOldRankRects=new Map(
      [...ranking.querySelectorAll("[data-gs-player-key]")].map(el=>[
        el.dataset.gsPlayerKey,
        {rect:el.getBoundingClientRect(),rank:Number(el.dataset.gsRank||0)}
      ])
    );

    ranking.className=`gs-spectator-ranking gs-premium-live-ranking gs-live-${game}${allEqual?" gs-ranking-tied":""}`;

    const colors=["#ffd20a","#a84cff","#159dff","#35d44f","#ff8d19","#28d6c4","#ff304f","#ef4cc8"];

    function statusFor(pos){
      if(allEqual)return "";
      if(pos===0)return game==="sixnimmt"?"MIGLIORE":"IN TESTA";
      if(pos===order.length-1&&order.length>1)return "ULTIMO";
      return "";
    }

    function rankBlock(pos,c){
      const icon=pos===0?"👑":pos===1?"🥈":pos===2?"🥉":"◆";
      const medal=pos===0?"🥇":"";
      return `<div class="gs-live-rank gs-live-rank-${Math.min(pos+1,4)}" style="--pc:${c}">
        <span class="gs-live-crown">${icon}</span>
        <strong>${medal}<b>${pos+1}°</b></strong>
      </div>`;
    }

    if(game==="flip7"){
      ranking.innerHTML=order.map((p,pos)=>{
        const c=colors[p.i%colors.length];
        const status=statusFor(pos);
        const missing=Math.max(0,target-p.total);
        const playerName=(typeof p.name==="object" && p.name!==null)
          ? String(p.name.name||p.name.label||p.name.playerName||`Giocatore ${p.i+1}`)
          : String(p.name ?? `Giocatore ${p.i+1}`);
        return `<article class="gs-premium-player gs-flip-live-card gs-spectator-flip-fixed" data-gs-player-key="${p.i}" data-gs-rank="${pos+1}" style="--pc:${c};--flip-player:${c}">
          ${status?`<span class="gs-live-status">${status}</span>`:""}
          ${rankBlock(pos,c)}
          <div class="gs-live-art gs-spectator-flip-art">
            <div class="gs-spectator-flip-stack stack-a"></div>
            <div class="gs-spectator-flip-stack stack-b"></div>
            <div class="gs-spectator-flip-tile">
              <span class="gs-spectator-flip-word">FLIP</span>
              <span class="gs-spectator-flip-seven">7</span>
            </div>
          </div>
          <div class="gs-live-player-main">
            <strong>${esc(playerName)}</strong>
            <div class="gs-live-last"><span>Ultimo round</span><b>+${Number(last?.[p.i]||0)}</b></div>
          </div>
          <div class="gs-live-score">
            <strong>${p.total}</strong>
            <span>Mancano <b>${missing}</b></span>
          </div>
        </article>`;
      }).join("");
    }else if(game==="seasalt"){
      const seaCards=[
        {img:"assets/sea46-card-boat.jpg",emoji:"⛵",label:"BARCA"},
        {img:"assets/sea46-card-fish.jpg",emoji:"🐟",label:"PESCE"},
        {emoji:"⭐",label:"STELLA"},
        {emoji:"🐚",label:"CONCHIGLIA"},
        {emoji:"🦀",label:"GRANCHIO"},
        {emoji:"🌿",label:"ORIGAMI"}
      ];
      ranking.innerHTML=order.map((p,pos)=>{
        const c=colors[p.i%colors.length];
        const status=statusFor(pos);
        const missing=Math.max(0,target-p.total);
        const card=seaCards[p.i%seaCards.length];
        return `<article class="gs-premium-player gs-sea-live-card" data-gs-player-key="${p.i}" data-gs-rank="${pos+1}" style="--pc:${c}">
          ${status?`<span class="gs-live-status">${status}</span>`:""}
          ${rankBlock(pos,c)}
          <div class="gs-live-art gs-live-sea-art">
            <div class="gs-sea-wave-back"></div>
            <div class="gs-sea-paper-card back"></div>
            <div class="gs-sea-medallion">
              ${card.img?`<img src="${card.img}" alt="${card.label}">`:`<span>${card.emoji}</span>`}
              <small>${card.label}</small>
            </div>
            <div class="gs-sea-foam">≈ ≋</div>
          </div>
          <div class="gs-live-player-main">
            <strong>${esc(p.name)}</strong>
            <div class="gs-live-last"><span>Ultimo round</span><b>+${Number(last?.[p.i]||0)}</b></div>
          </div>
          <div class="gs-live-score">
            <strong>${p.total}</strong>
            <span>${missing?`Mancano <b>${missing}</b>`:"Traguardo raggiunto"}</span>
          </div>
        </article>`;
      }).join("");
    }else{
      const arts=[
        "assets/six45-player-gold.jpg",
        "assets/six45-player-purple.jpg",
        "assets/six45-player-blue.jpg"
      ];
      ranking.innerHTML=order.map((p,pos)=>{
        const c=colors[p.i%colors.length];
        const status=statusFor(pos);
        const remaining=Math.max(0,66-p.total);
        const art=arts[p.i%arts.length];
        const cardNo=String(p.i+1).padStart(2,"0");
        return `<article class="gs-premium-player gs-six-live-card" data-gs-player-key="${p.i}" data-gs-rank="${pos+1}" style="--pc:${c}">
          ${status?`<span class="gs-live-status">${status}</span>`:""}
          ${rankBlock(pos,c)}
          <div class="gs-live-art gs-live-six-art">
            <img src="${art}" alt="Toro">
            <div class="gs-six-number-card">
              <span>🐂</span><strong>${cardNo}</strong><span>🐂</span>
            </div>
          </div>
          <div class="gs-live-player-main">
            <strong>${esc(p.name)}</strong>
            <div class="gs-live-last"><span>Ultimo round</span><b>+${Number(last?.[p.i]||0)}</b></div>
          </div>
          <div class="gs-live-score">
            <strong>${p.total}</strong>
            <span>${p.total>66?"OLTRE 66":p.total===66?"SOGLIA RAGGIUNTA":`Mancano <b>${remaining}</b>`}</span>
          </div>
        </article>`;
      }).join("");
    }


    // V86 — animate real ranking movement instead of simply swapping rows.
    // This is the FLIP technique (First, Last, Invert, Play).
    if(gsOldRankRects.size){
      requestAnimationFrame(()=>{
        let gsRankMoved=false;
        [...ranking.querySelectorAll("[data-gs-player-key]")].forEach((el,newIndex)=>{
          const prev=gsOldRankRects.get(el.dataset.gsPlayerKey);
          if(!prev)return;
          const now=el.getBoundingClientRect();
          const dx=prev.rect.left-now.left;
          const dy=prev.rect.top-now.top;
          const newRank=Number(el.dataset.gsRank||0);

          if(Math.abs(dx)>1 || Math.abs(dy)>1){
            if(prev.rank!==newRank)gsRankMoved=true;
            el.classList.add("gs-rank-moving");
            el.animate(
              [
                {transform:`translate(${dx}px,${dy}px) scale(.985)`,filter:"brightness(.94)"},
                {transform:"translate(0,0) scale(1.018)",offset:.72,filter:"brightness(1.13)"},
                {transform:"translate(0,0) scale(1)",filter:"brightness(1)"}
              ],
              {duration:1800,easing:"cubic-bezier(.18,.72,.18,1)",fill:"both"}
            ).finished.finally(()=>el.classList.remove("gs-rank-moving"));

            if(prev.rank!==newRank){
              el.classList.add(newRank<prev.rank?"gs-rank-up":"gs-rank-down");
              setTimeout(()=>el.classList.remove("gs-rank-up","gs-rank-down"),2800);
            }
          }
        });
        if(gsRankMoved)gsPlaySound("rank");
      });
    }

    document.getElementById("gsSpectatorOffline").classList.add("hidden");
    app.classList.remove("hidden");

    // Snapshot dello stato realmente mostrato, usato per riconoscere
    // l'arrivo del round successivo.
    gsSpectatorRenderedSnapshot=gsSpectatorClone(s);
  }

  async function fetchSpectator(code){
    const sb=getClient();
    if(!sb)throw new Error("GAME SCORE Online non configurato.");
    const {data,error}=await sb.rpc("gs_get_room",{p_join_code:code});
    if(error)throw error;
    if(!data)throw new Error("Partita non trovata.");
    const row=Array.isArray(data)?data[0]:data;
    if(!row)throw new Error("Partita non trovata.");
    gsSpectatorReceiveState(row.game_type,row.state,row.closed);
  }

  async function startSpectator(code){
    spectatorCode=String(code||"").trim().toUpperCase();
    document.getElementById("homeScreen")?.classList.add("hidden");
    document.getElementById("flip7App")?.classList.add("hidden");
    document.getElementById("seaSaltWorld")?.classList.add("hidden");
    document.getElementById("sixNimmtWorld")?.classList.add("hidden");
    document.getElementById("gsShareRoomBtn")?.classList.add("hidden");

    const offline=document.getElementById("gsSpectatorOffline");
    try{
      await fetchSpectator(spectatorCode);
    }catch(e){
      document.getElementById("gsSpectatorApp")?.classList.remove("hidden");
      offline?.classList.remove("hidden");
      document.getElementById("gsSpectatorOfflineText").textContent=e.message||String(e);
      return;
    }

    const sb=getClient();
    spectatorChannel=sb.channel(`gs-room-${spectatorCode}`)
      .on("broadcast",{event:"state"},({payload})=>{
        if(payload?.state)gsSpectatorReceiveState(payload.game_type,payload.state,!!payload.closed);
      })
      .subscribe();

    // Recovery polling: protects against a missed Broadcast or suspended mobile browser.
    setInterval(()=>fetchSpectator(spectatorCode).catch(()=>{}),12000);
    document.addEventListener("visibilitychange",()=>{
      if(document.visibilityState==="visible")fetchSpectator(spectatorCode).catch(()=>{});
    });
  }


  document.getElementById("gsSpectatorHallBtn")?.addEventListener("click",()=>{
    gsSpectatorRenderHall(spectatorHallState.game,spectatorHallState.hall);
    document.getElementById("gsSpectatorHallModal")?.classList.remove("hidden");
  });
  document.getElementById("gsSpectatorHallClose")?.addEventListener("click",gsSpectatorCloseHall);
  document.getElementById("gsSpectatorHallModal")?.addEventListener("click",e=>{if(e.target===e.currentTarget)gsSpectatorCloseHall()});
  document.getElementById("gsSpectatorProfileClose")?.addEventListener("click",()=>gsSpectatorCloseProfile(false));
  document.getElementById("gsSpectatorProfileBack")?.addEventListener("click",()=>gsSpectatorCloseProfile(true));
  document.getElementById("gsSpectatorProfileModal")?.addEventListener("click",e=>{if(e.target===e.currentTarget)gsSpectatorCloseProfile(false)});
  document.getElementById("gsSpectatorWinClose")?.addEventListener("click",gsSpectatorCloseWin);
  // Wrap the three existing persistence methods: local save stays source of truth for host,
  // then online room is updated when one exists.
  const localFlipSave=save;
  save=function(){
    localFlipSave();
    window.gsOnlineMaybePush("flip7",state);
    setTimeout(updateShareButton,0);
  };
  const localSeaSave=seaSave;
  seaSave=function(){
    localSeaSave();
    window.gsOnlineMaybePush("seasalt",seaState);
    setTimeout(updateShareButton,0);
  };
  const localSixSave=six39Save;
  six39Save=function(){
    localSixSave();
    window.gsOnlineMaybePush("sixnimmt",six39State);
    setTimeout(updateShareButton,0);
  };

  // UI bindings.
  document.getElementById("gsShareRoomBtn")?.addEventListener("click",openShare);
  document.getElementById("gsCloudHostManage")?.addEventListener("click",openHostResumeModal);
  document.getElementById("gsHostResumeSaveBtn")?.addEventListener("click",saveHostCodeFromModal);
  document.getElementById("gsHostResumeInput")?.addEventListener("input",e=>{e.target.value=normalizeHostCode(e.target.value)});
  document.getElementById("gsHostResumeInput")?.addEventListener("keydown",e=>{if(e.key==="Enter")saveHostCodeFromModal()});
  document.getElementById("gsForgetHostCodeBtn")?.addEventListener("click",()=>{
    localStorage.removeItem(HOST_RESUME_KEY);
    document.getElementById("gsHostResumeInput").value="";
    document.getElementById("gsHostResumeStatus").textContent="Codice Host dimenticato su questo dispositivo.";
    refreshHostCloudUI();
  });
  document.getElementById("gsCopyHostCodeBtn")?.addEventListener("click",async()=>{
    const code=ensureHostResumeCode();
    const el=document.getElementById("gsHostResumeCode");if(el)el.textContent=code;
    try{await navigator.clipboard.writeText(code);setStatus("Codice Host copiato")}
    catch(e){setStatus("Codice Host: "+code)}
  });
  document.querySelectorAll("[data-online-close]").forEach(b=>
    b.addEventListener("click",()=>document.getElementById(b.dataset.onlineClose)?.classList.add("hidden"))
  );
  document.getElementById("gsCopyLinkBtn")?.addEventListener("click",async()=>{
    const input=document.getElementById("gsSpectatorUrl");
    try{
      await navigator.clipboard.writeText(input.value);
      setStatus("Link copiato");
    }catch(e){
      input.select();
      document.execCommand("copy");
      setStatus("Link copiato");
    }
  });
  document.getElementById("gsRefreshQrBtn")?.addEventListener("click",()=>{
    qrRender(document.getElementById("gsSpectatorUrl").value);
  });

  // Keep host share control aligned with navigation changes.
  new MutationObserver(()=>updateShareButton())
    .observe(document.body,{subtree:true,attributes:true,attributeFilter:["class"]});
  updateShareButton();

  // Host multi-dispositivo: collega le eventuali stanze locali pre-V84 e
  // cerca automaticamente partite attive associate al Codice Host.
  setTimeout(async()=>{
    if(!new URLSearchParams(location.search).has("room")){
      for(const g of ["flip7","seasalt","sixnimmt"]){
        if(loadRoom(g))await bindExistingRoom(g).catch(()=>{});
      }
      await refreshHostCloudUI();
    }
  },250);

  // Spectator deep-link.
  const roomParam=new URLSearchParams(location.search).get("room");
  if(roomParam){
    setTimeout(()=>startSpectator(roomParam),0);
  }
})();


/* v68 visual hook: exposes current game to CSS only. */
(function(){
  function gsVisualGameHook(){
    try{
      var candidates = [
        document.querySelector('[data-game].active'),
        document.querySelector('[data-game-id].active'),
        document.querySelector('.game-screen:not([hidden])'),
        document.querySelector('.game-page:not([hidden])')
      ].filter(Boolean);
      var el = candidates[0];
      var val = el && (el.dataset.game || el.dataset.gameId || '');
      if(!val){
        var t=(document.title+' '+document.body.innerText.slice(0,500)).toLowerCase();
        if(t.includes('flip 7') || t.includes('flip7')) val='flip7';
        else if(t.includes('sea salt')) val='seasalt';
        else if(t.includes('le prendi')) val='6nimmt';
      }
      if(val) document.body.dataset.game=val;
    }catch(e){}
  }
  document.addEventListener('click',function(){setTimeout(gsVisualGameHook,30)},true);
  window.addEventListener('hashchange',gsVisualGameHook);
  window.addEventListener('popstate',gsVisualGameHook);
  window.addEventListener('load',gsVisualGameHook);
  setInterval(gsVisualGameHook,1200);
})();

/* V76 visual-only spectator title helper */
(function(){
  function gsV76TitleFix(){
    const el=document.getElementById("gsSpectatorGameTitle") ||
             document.querySelector(".gs-spectator-game-title");
    if(!el)return;
    el.classList.toggle("gs-title-has-seven",/\b7\b/.test(el.textContent||""));
  }
  window.addEventListener("load",gsV76TitleFix);
  document.addEventListener("click",()=>setTimeout(gsV76TitleFix,40),true);
  setInterval(gsV76TitleFix,1200);
})();


/* V90 — prima sincronizzazione dei contatori Trofeo */
setTimeout(()=>{try{gsUpdateHistoricalTrophyButtons()}catch(e){}},120);
window.addEventListener("pageshow",()=>setTimeout(()=>{try{gsUpdateHistoricalTrophyButtons()}catch(e){}},80));

/* V102 — controlli manuali HOST */
document.getElementById("flipTurnPrev")?.addEventListener("click",()=>{gsMoveTurn(state,-1);save();render()});
document.getElementById("flipTurnNext")?.addEventListener("click",()=>{gsMoveTurn(state,1);save();render()});
document.getElementById("seaTurnPrev")?.addEventListener("click",()=>{gsMoveTurn(seaState,-1);seaSave();seaRender()});
document.getElementById("seaTurnNext")?.addEventListener("click",()=>{gsMoveTurn(seaState,1);seaSave();seaRender()});
document.getElementById("sixTurnPrev")?.addEventListener("click",()=>{gsMoveTurn(six39State,-1);six39Save();six39Render()});
document.getElementById("sixTurnNext")?.addEventListener("click",()=>{gsMoveTurn(six39State,1);six39Save();six39Render()});
