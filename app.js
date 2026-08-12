
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

let state={players:[],rounds:[],target:200,gameId:null,resultRecorded:false};
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
function loadHall(){
  try{
    const raw=localStorage.getItem(HALL_KEY);
    return raw?JSON.parse(raw):{players:{},totalGames:0};
  }catch(e){return {players:{},totalGames:0}}
}
function saveHall(h){localStorage.setItem(HALL_KEY,JSON.stringify(h))}
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
      hall.players[key]={name:name.trim(),wins:0,games:0,lastWin:null,bestScore:0};
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

  saveHall(hall);
  state.resultRecorded=true;
  save();
}

function cardMarkup(i){
  const t=themes[i%themes.length];
  if(t.asset)return `<img class="avatar-img" src="${t.asset}" alt="${esc(t.fallback)}">`;
  return `<div class="number-card">${esc(t.fallback)}</div>`;
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
    return `<div class="round-input-row" style="--rc:${t.c}">
      <div class="player-mini">
        <div class="player-mini-icon">${esc(t.fallback)}</div>
        <div><strong>${esc(n)}</strong><div class="player-last">Totale attuale: ${ts[i]}</div></div>
      </div>
      <input class="input round-score" type="number" min="0" inputmode="numeric" value="0" data-i="${i}">
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
    return `<div class="round-input-row" style="--rc:${t.c}">
      <div class="player-mini">
        <div class="player-mini-icon">${esc(t.fallback)}</div>
        <div><strong>${esc(n)}</strong><div class="player-last">Totale prima del round: ${tsBefore[i]}</div></div>
      </div>
      <input class="input round-score" type="number" min="0" inputmode="numeric" value="${existing[i]||0}" data-i="${i}">
    </div>`;
  }).join("");
  bindRoundInputTotals();
  $("#saveRound").dataset.editRound=String(roundIndex);
  openModal("roundModal");
}

function openModal(id){$("#"+id).classList.remove("hidden")}
function closeModal(id){$("#"+id).classList.add("hidden")}


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
    roundNumber=state.rounds.length;
  }

  save();

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

  state={players:[],rounds:[],target:200,gameId:null,resultRecorded:false};
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
  state={players:[],rounds:[],target:200,gameId:null,resultRecorded:false};
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
  $("#profileLastWin").textContent=formatItalianDate(p.lastWin);

  openModal("playerProfileModal");
}

function renderHall(){
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
      <div class="podium-meta">${p.games||0} partite · ${p.rate.toFixed(0)}%</div>
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
        <div class="hall-meta">${p.games||0} partite · ${p.rate.toFixed(0)}% vittorie</div>
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
  hideWinScreen();
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
let seaState={players:[],rounds:[],target:40,finished:false,winner:null,recorded:false};
let seaSetupCount=2;
let seaSetupDraftNames=[];

function seaLoad(){seaState=gsRobustLoad(SEA_KEY,seaState)}
function seaSave(){gsRobustSave(SEA_KEY,seaState,"seasalt",!!seaState.players.length && !seaState.finished)}
function seaTotals(){return seaState.players.map((_,i)=>seaState.rounds.reduce((s,r)=>s+(Number(r[i])||0),0))}
function seaTargetFor(n){return n===2?40:n===3?35:30}
function seaHallLoad(){try{return JSON.parse(localStorage.getItem(SEA_HALL_KEY))||{games:0,players:{}}}catch(e){return{games:0,players:{}}}}
function seaHallSave(h){localStorage.setItem(SEA_HALL_KEY,JSON.stringify(h))}
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
    seaState.rounds=remappedRounds;
    seaState.target=seaTargetFor(names.length);
    seaState.finished=false;
    seaState.winner=null;
    seaState.recorded=false;
  }else{
    seaState={players:names,rounds:[],target:seaTargetFor(names.length),finished:false,winner:null,recorded:false};
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
  if(e!==""){rn=Number(e)+1;seaState.rounds[Number(e)]=vals}else{seaState.rounds.push(vals);rn=seaState.rounds.length}
  seaSave();closeModal("seaRoundModal");seaRender();seaToast(`✓ Round ${rn} ${e!==""?"aggiornato":"registrato"}`);
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
      hall.players[k]=hall.players[k]||{name:n,wins:0,games:0,best:0,lastWin:null};
      hall.players[k].name=n;
      hall.players[k].games=(hall.players[k].games||0)+1;
      hall.players[k].best=Math.max(hall.players[k].best||0,totals[pi]||0);
    });
    const k=seaKey(name);
    hall.players[k].wins=(hall.players[k].wins||0)+1;
    hall.players[k].lastWin=new Date().toISOString();
    seaHallSave(hall);
    seaState.recorded=true;
  }
  seaSave();

  $("#seaWinTitle").textContent=`${name.toUpperCase()} VINCE!`;
  $("#seaWinScore").textContent=mermaids?"4 🧜‍♀️":totals[i];
  const order=seaState.players.map((n,j)=>({n,j,t:totals[j]})).sort((a,b)=>b.t-a.t);
  $("#seaFinalRanking").innerHTML=order.map((x,r)=>`<div class="final-row ${x.j===i?"winner-row":""}" style="--fc:#79e2dc"><div class="final-pos">${r===0?"🥇":r===1?"🥈":r===2?"🥉":r+1+"°"}</div><div class="final-name">${esc(x.n)}</div><div class="final-points"><b>${x.t}</b><span>punti</span></div></div>`).join("");
  gsShowPerfectWin("seaWinScreen","sea");
}
function seaRenderHistory(){
  $("#seaHistoryList").innerHTML=seaState.rounds.length?seaState.rounds.map((r,i)=>`<div class="sea-history-card"><div class="sea-history-head"><b>Round ${i+1}</b><div class="sea-history-actions"><button onclick="closeModal('seaHistoryModal');seaOpenRound(${i})">Modifica</button><button class="danger" onclick="seaDeleteRound(${i})">Elimina</button></div></div>${r.map((v,j)=>`<div>${esc(seaState.players[j])}: <b>+${v}</b></div>`).join("")}</div>`).reverse().join(""):'<p class="helper">Ancora nessun round.</p>';
}
function seaDeleteRound(i){if(seaState.finished)return alert("La partita è già conclusa.");if(confirm(`Eliminare Round ${i+1}?`)){seaState.rounds.splice(i,1);seaSave();seaRender();seaRenderHistory()}}
function seaRenderHall(){
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
      <div class="podium-meta">${p.games||0} partite · ${p.rate.toFixed(0)}%</div>
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

function seaDeleteGame(){if(confirm("Eliminare completamente questa partita Sea Salt & Paper?")){seaState={players:[],rounds:[],target:40,finished:false,winner:null,recorded:false};seaSave();$("#seaWinScreen").classList.add("hidden");showHome();window.renderResumeCenter?.()}}
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

$("#seaNewGame").onclick=()=>{seaState={players:[],rounds:[],target:40,finished:false,winner:null,recorded:false};seaSave();$("#seaWinScreen").classList.add("hidden");seaOpenInlineSetup(false)};



/* ===========================
   v39 — 6... LE PRENDI!
   Layout gemello di Flip 7
   =========================== */
const SIX39_KEY="gs_six39_game", SIX39_HALL="gs_six39_hall";
let six39State={players:[],rounds:[],finished:false,winner:null,recorded:false};
let six39Count=3, six39Draft=[], six39EditDraft=[];
const six39Colors=["#ffd20a","#b747ff","#1fa8ff","#31d25d","#ff6b35","#ff4c87","#4dd8d2","#8d7cff","#e9db51","#d88942"];

function six39Key(v){return String(v||"").trim().toLocaleLowerCase("it")}
function six39Load(){six39State=gsRobustLoad(SIX39_KEY,six39State)}
function six39Save(){gsRobustSave(SIX39_KEY,six39State,"sixnimmt",!!six39State.players.length && !six39State.finished)}
function six39Totals(){return six39State.players.map((_,i)=>six39State.rounds.reduce((s,r)=>s+(Number(r[i])||0),0))}
function six39HallLoad(){try{return JSON.parse(localStorage.getItem(SIX39_HALL)||'{"games":0,"players":{}}')}catch(e){return{games:0,players:{}}}}
function six39HallSave(h){localStorage.setItem(SIX39_HALL,JSON.stringify(h))}

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
  six39State={players:names,rounds:[],finished:false,winner:null,recorded:false};
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
        <div class="six45-threshold">${p.total>66?"OLTRE 66":`Mancano ${67-p.total}`}</div>
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
  if(e!==""){rn=Number(e)+1;six39State.rounds[Number(e)]=vals}else{six39State.rounds.push(vals);rn=six39State.rounds.length}
  six39State.finished=false;six39State.winner=null;six39State.recorded=false;
  six39Save();closeModal("six39RoundModal");six39Render();
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
  six39State.players=names;six39State.finished=false;six39State.winner=null;six39State.recorded=false;six39Save();
  closeModal("six39EditModal");six39Render();
}
function six39DeleteGame(){
  if(!confirm("Eliminare completamente questa partita?"))return;
  six39State={players:[],rounds:[],finished:false,winner:null,recorded:false};
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
}
function six39RecordWin(){
  if(six39State.recorded||six39State.winner===null)return;
  const hall=six39HallLoad(),totals=six39Totals();
  hall.games=(hall.games||0)+1;
  six39State.players.forEach((n,i)=>{
    const k=six39Key(n),p=hall.players[k]||{name:n,wins:0,games:0,best:null,lastWin:null};
    p.games++;p.best=p.best===null?totals[i]:Math.min(p.best,totals[i]);
    if(i===six39State.winner){p.wins++;p.lastWin=new Date().toISOString()}
    hall.players[k]=p;
  });
  six39HallSave(hall);six39State.recorded=true;six39Save();
}
function six39RenderHall(){
  const h=six39HallLoad(),rows=Object.values(h.players||{}).map(p=>({...p,rate:p.games?((p.wins||0)/p.games*100):0}))
    .sort((a,b)=>(b.wins||0)-(a.wins||0)||b.rate-a.rate||(b.games||0)-(a.games||0)||a.name.localeCompare(b.name,"it"));
  $("#six39HallSummary").innerHTML=`
    <div class="summary-card"><b>${h.games||0}</b><span>Partite</span></div>
    <div class="summary-card"><b>${rows.length}</b><span>Giocatori</span></div>
    <div class="summary-card"><b>${rows.reduce((s,p)=>s+(p.wins||0),0)}</b><span>Vittorie</span></div>`;
  if(!rows.length){$("#six39HallPodium").innerHTML="";$("#six39HallList").innerHTML='<div class="empty-state">Nessuna partita conclusa ancora.</div>';return}
  const pc=["#ffd20a","#c7d0df","#d88942"],first3=rows.slice(0,3),po=[first3[1],first3[0],first3[2]].filter(Boolean);
  $("#six39HallPodium").innerHTML=po.map(p=>{const idx=rows.indexOf(p);return `<div class="podium-card ${idx===0?"first":""}" style="--pc:${pc[idx]}">${idx===0?'<div class="podium-crown">👑</div>':""}<div class="podium-medal">${idx===0?"🥇":idx===1?"🥈":"🥉"}</div><div class="podium-name">${esc(p.name)}</div><div class="podium-wins">${p.wins||0}</div><div class="podium-meta">${p.games||0} partite · ${p.rate.toFixed(0)}%</div></div>`}).join("");
  $("#six39HallList").innerHTML=rows.map((p,i)=>`<div class="hall-row" style="--hc:${six39Colors[i%six39Colors.length]}"><div class="hall-pos">${i===0?"🥇":i===1?"🥈":i===2?"🥉":i+1+"°"}</div><div><div class="hall-name">${esc(p.name)}</div><div class="hall-meta">${p.games||0} partite · ${p.rate.toFixed(0)}% vittorie · miglior punteggio ${p.best??"—"}</div></div><div class="hall-wins"><b>${p.wins||0}</b><span>Vittorie</span></div></div>`).join("");
}
function six39ResetHall(){if(confirm("Azzerare tutta la classifica generale?")){six39HallSave({games:0,players:{}});six39RenderHall()}}
function six39Rematch(){six39State.rounds=[];six39State.finished=false;six39State.winner=null;six39State.recorded=false;six39Save();$("#six39WinScreen").classList.add("hidden");six39Render()}
function six39NewGame(){six39State={players:[],rounds:[],finished:false,winner:null,recorded:false};six39Save();$("#six39WinScreen").classList.add("hidden");six39OpenSetup(false)}

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
      const flipSpectatorCards=[
        {asset:"assets/freeze.png",label:"FREEZE!",value:null},
        {asset:"assets/flip_three.png",label:"FLIP THREE!",value:null},
        {asset:"assets/second_chance.png",label:"SECOND CHANCE",value:null},
        {asset:"assets/num_12.png",label:"12",value:null},
        {asset:null,label:"11",value:"11"},
        {asset:null,label:"7",value:"7"}
      ];
      ranking.innerHTML=order.map((p,pos)=>{
        const c=colors[p.i%colors.length];
        const status=statusFor(pos);
        const missing=Math.max(0,target-p.total);
        const card=flipSpectatorCards[p.i%flipSpectatorCards.length];
        const art=card.asset
          ? `<img class="gs-flip-approved-img" src="${card.asset}" alt="${esc(card.label)}">`
          : `<div class="gs-flip-approved-number gs-flip-num-${card.value}"><span>${card.value}</span><small>FLIP 7</small></div>`;
        return `<article class="gs-premium-player gs-flip-live-card gs-flip-approved" style="--pc:${c}">
          ${status?`<span class="gs-live-status">${status}</span>`:""}
          ${rankBlock(pos,c)}
          <div class="gs-live-art gs-live-flip-art">
            <div class="gs-flip-burst"></div>
            <div class="gs-live-card-back back-one"></div>
            <div class="gs-live-card-back back-two"></div>
            <div class="gs-live-card-back back-three"></div>
            <div class="gs-flip-approved-front">${art}</div>
            <div class="gs-flip-card-shine"></div>
          </div>
          <div class="gs-live-player-main">
            <strong>${esc(p.name)}</strong>
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
        {kind:"emoji",symbol:"⛵",label:"BARCA",tone:"boat"},
        {kind:"emoji",symbol:"⭐",label:"STELLA MARINA",tone:"star"},
        {kind:"emoji",symbol:"🦀",label:"GRANCHIO",tone:"crab"},
        {kind:"emoji",symbol:"🐚",label:"CONCHIGLIA",tone:"shell"},
        {kind:"origami",symbol:"◆",label:"ORIGAMI",tone:"origami"},
        {kind:"emoji",symbol:"🐟",label:"PESCE",tone:"fish"}
      ];
      ranking.innerHTML=order.map((p,pos)=>{
        const c=colors[p.i%colors.length];
        const status=statusFor(pos);
        const missing=Math.max(0,target-p.total);
        const card=seaCards[p.i%seaCards.length];
        const seaArt=card.kind==="origami"
          ? `<div class="gs-sea-origami-crane" aria-label="${esc(card.label)}"><i></i><b></b><em></em></div>`
          : `<div class="gs-sea-symbol gs-sea-${card.tone}" aria-label="${esc(card.label)}">${card.symbol}</div>`;
        return `<article class="gs-premium-player gs-sea-live-card gs-sea-approved" style="--pc:${c}">
          ${status?`<span class="gs-live-status">${status}</span>`:""}
          ${rankBlock(pos,c)}
          <div class="gs-live-art gs-live-sea-art">
            <div class="gs-sea-wave-back"></div>
            <div class="gs-sea-paper-card back"></div>
            <div class="gs-sea-medallion gs-sea-approved-card">
              <div class="gs-sea-paper-fold"></div>
              ${seaArt}
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
        const remaining=Math.max(0,67-p.total);
        const art=arts[p.i%arts.length];
        const cardNo=String(p.i+1).padStart(2,"0");
        return `<article class="gs-premium-player gs-six-live-card" style="--pc:${c}">
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
            <span>${p.total>66?"OLTRE 66":`Mancano <b>${remaining}</b>`}</span>
          </div>
        </article>`;
      }).join("");
    }

    document.getElementById("gsSpectatorOffline").classList.add("hidden");
    app.classList.remove("hidden");
  }

  async function fetchSpectator(code){
    const sb=getClient();
    if(!sb)throw new Error("GAME SCORE Online non configurato.");
    const {data,error}=await sb.rpc("gs_get_room",{p_join_code:code});
    if(error)throw error;
    if(!data)throw new Error("Partita non trovata.");
    const row=Array.isArray(data)?data[0]:data;
    if(!row)throw new Error("Partita non trovata.");
    renderSpectator(row.game_type,row.state,row.closed);
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
        if(payload?.state)renderSpectator(payload.game_type,payload.state,!!payload.closed);
      })
      .subscribe();

    // Recovery polling: protects against a missed Broadcast or suspended mobile browser.
    setInterval(()=>fetchSpectator(spectatorCode).catch(()=>{}),12000);
    document.addEventListener("visibilitychange",()=>{
      if(document.visibilityState==="visible")fetchSpectator(spectatorCode).catch(()=>{});
    });
  }

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

  // Spectator deep-link.
  const roomParam=new URLSearchParams(location.search).get("room");
  if(roomParam){
    setTimeout(()=>startSpectator(roomParam),0);
  }
})();
