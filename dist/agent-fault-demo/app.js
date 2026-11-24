const agents=[{"id":"supervisor","name":"Supervisor","role":"Supervisor / Orchestrator","tier":1,"color":"#e6cc87","status":"idle","x":14,"y":27,"objective":"Coordinate the recorded valve-fault investigation.","artifact":"investigation-plan.md","to":"Four specialists → Fault Diagnoser","logs":["Ready for replay."]},{"id":"data","name":"Data Analyst","role":"Data Analyst","color":"#75dce6","status":"working","x":22,"y":51,"objective":"Prepare the recorded sensor window.","artifact":"recording-summary.md","to":"Fault Diagnoser","logs":["Ready for replay."],"tier":2},{"id":"ml","name":"ML Specialist","role":"ML Specialist","color":"#bba4ff","status":"working","x":50,"y":51,"objective":"Score the fault run against normal operation.","artifact":"pca-monitoring-summary.md","to":"Fault Diagnoser","logs":["Ready for replay."],"tier":2},{"id":"fault","name":"Fault Historian","role":"Fault Historian","color":"#eeb86e","status":"working","x":78,"y":51,"objective":"Verify the fault against the simulator event history.","artifact":"fault-history-summary.md","to":"Fault Diagnoser","logs":["Ready for replay."],"tier":2},{"id":"expert","name":"Process Expert","role":"Process Expert","color":"#8fdfb6","status":"idle","x":32,"y":83,"objective":"Explain the feed-loop topology and the response.","artifact":"process-context.md","to":"Fault Diagnoser","logs":["Ready for replay."],"tier":2},{"id":"diagnosis","name":"Fault Diagnoser","role":"Final Reviewer / Fault Diagnoser","color":"#91baff","status":"reviewing","x":68,"y":83,"objective":"Reconcile the recorded signals, T?, event log, and wiki.","artifact":"fault-diagnosis.md","to":"Supervisor / Human reviewer","logs":["Ready for replay."],"tier":3}];
const $=id=>document.getElementById(id);const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let running=false;
function renderOffice(){ renderNetwork(); $('roster').innerHTML=[{tier:1,title:'01 / ORCHESTRATION'},{tier:2,title:'02 / SPECIALISTS'},{tier:3,title:'03 / FINAL REVIEW'}].map(group=>`<div class="roster-tier"><h3>${group.title}</h3>${agents.filter(a=>a.tier===group.tier).map(a=>`<button class="roster-agent " data-agent="${a.id}" style="--agent:${a.color}" aria-label="Open ${a.role}, ${a.status}"><span class="avatar"><img class="roster-robot" src="${robotAsset(a.id)}" alt=""></span><span><span class="name">${a.name}</span><span class="role">${a.status}</span></span><span class="dot ${a.status}"></span></button>`).join('')}</div>`).join('');$('desks').innerHTML=agents.map(a=>a.screens.map((screen,i)=>`<button class="screen-hotspot ${a.status}" data-agent="${a.id}" style="left:${screen.x}%;top:${screen.y}%;width:${screen.w}%;height:${screen.h}%;--agent:${a.color};--screen-shape:${screen.shape}" aria-label="Inspect ${a.role}'s screen ${i+1}" title="${a.name}"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points="${screen.points}"/></svg></button>`).join('')).join('');}
const jobs=[{id:'J-01',agent:'data',objective:'Prepare sensor window',dependencies:[]},{id:'J-02',agent:'ml',objective:'Score Hotelling T?',dependencies:['data']},{id:'J-03',agent:'fault',objective:'Verify simulator event log',dependencies:['data']},{id:'J-04',agent:'expert',objective:'Explain process context',dependencies:['data']},{id:'J-05',agent:'diagnosis',objective:'Review evidence and diagnose',dependencies:['data','ml','fault','expert']}];
const jobState=new Map(jobs.map(j=>[j.agent,'planned']));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function badge(id){return {supervisor:'SO',data:'DA',ml:'ML',fault:'FH',expert:'PE',diagnosis:'FD'}[id];}
function emit(from,to,text){highlightHandoff(from,to);
window.dispatchEvent(new CustomEvent('demo-handoff', {detail: {from,to,text}}));}
async function executeJob(job){const a=agents.find(a=>a.id===job.agent),supervisor=agents.find(a=>a.id==='supervisor');if(job.dependencies.some(id=>jobState.get(id)!=='complete')||a.status==='paused'||supervisor.status==='paused'){jobState.set(a.id,'blocked');a.logs.push('Assignment held: prerequisite output or supervisor unavailable.');emit('Supervisor',a.name,'Job held pending prerequisite work or resume');return false;}jobState.set(a.id,'assigned');supervisor.logs.push('Dispatched '+job.id+' to '+a.name+'.');a.logs.push('Received '+job.id+' from the Supervisor: '+job.objective);emit('Supervisor',a.name,job.id+' · '+job.objective);await summon(a.id);if(a.status==='paused'||supervisor.status==='paused'){jobState.set(a.id,'blocked');return false;}a.status=a.id==='diagnosis'?'reviewing':'working';jobState.set(a.id,'working');renderOffice();await wait(2300);if(a.status==='paused'||supervisor.status==='paused'){jobState.set(a.id,'blocked');a.logs.push('Output held while paused.');emit(a.name,'Supervisor','Job paused; final review held');return false;}a.status='complete';jobState.set(a.id,'complete');a.logs.push(a.artifact+' delivered to '+a.to+'.');supervisor.logs.push('Received '+a.artifact+' from '+a.name+'.');emit(a.name,a.id==='diagnosis'?'Supervisor':'Final review station',a.artifact+' ready');releaseRobot(a.id);renderOffice();return true;}
async function runWorkflow() {
  running = true;
  try {
    clearNetworkActivity();
    for (const agent of agents) {
      agent.status = 'idle';
      releaseRobot(agent.id);
      agent.logs = ['Recorded fault investigation started.'];
    }
    jobs.forEach(job => jobState.set(job.agent, 'planned'));
    renderOffice();

    const supervisor = agents.find(agent => agent.id === 'supervisor');
    await summon('supervisor');
    emit('Supervisor', 'Specialist team', 'Investigation opened');
    await executeJob(jobs[0]);
    await Promise.all(jobs.slice(1, 4).map(executeJob));
    const reviewed = await executeJob(jobs[4]);
    supervisor.status = reviewed ? 'complete' : 'blocked';
    if (reviewed) {
      supervisor.logs.push('Final diagnosis received: VLV-100 actuator failed open.');
      emit('Supervisor', 'Human reviewer', 'Final review ready');
      releaseRobot('supervisor');
    }
    renderOffice();
  } finally {
    running = false;
  }
}



// Coordinates are percentages of the uncropped room image. Screen polygons follow perspective.
const screenPixels=[
 [[[78,342],[139,329],[141,391],[79,406]],[[145,329],[235,329],[235,392],[145,392]],[[241,330],[302,342],[300,407],[241,391]]],
 [[[524,319],[582,307],[583,362],[523,374]],[[588,307],[669,307],[669,361],[587,361]],[[674,309],[725,319],[722,374],[674,362]]],
 [[[811,319],[860,307],[860,363],[812,375]],[[866,307],[948,307],[948,362],[866,362]],[[954,309],[1008,320],[1004,374],[954,363]]],
 [[[492,517],[553,506],[554,564],[492,577]],[[559,507],[653,507],[653,565],[559,565]],[[660,509],[724,522],[722,578],[660,565]]],
 [[[816,517],[879,506],[879,565],[816,578]],[[885,508],[974,508],[974,565],[885,565]],[[980,509],[1046,522],[1046,579],[980,566]]],
 [[[1238,342],[1303,330],[1303,392],[1239,407]],[[1307,329],[1397,329],[1397,392],[1307,392]],[[1403,331],[1465,344],[1464,407],[1403,391]]]
];
function screenCoordinates(vertices){const xs=vertices.map(p=>p[0]),ys=vertices.map(p=>p[1]),left=Math.min(...xs),top=Math.min(...ys),width=Math.max(...xs)-left,height=Math.max(...ys)-top;const normalized=vertices.map(([x,y])=>[(x-left)*100/width,(y-top)*100/height]);return {x:left*100/1536,y:top*100/1024,w:width*100/1536,h:height*100/1024,points:normalized.map(p=>p.join(',')).join(' '),shape:'polygon('+normalized.map(p=>p.map(n=>n+'%').join(' ')).join(',')+')'};}
const navigation=[
 {x:28,y:82,links:[1,7]},{x:39,y:82,links:[0,2,14]},{x:50,y:82,links:[1,3,5]},{x:61,y:82,links:[2,4,15]},{x:72,y:82,links:[3,8]},
 {x:50,y:70,links:[2,6]},{x:50,y:48,links:[5,12,13]},
 {x:27,y:64,links:[0,9]},{x:73,y:64,links:[4,10]},
 {x:22,y:65,links:[7,11]},{x:78,y:65,links:[8,16]},
 {x:12,y:53,links:[9]},{x:40.5,y:47.5,links:[6]},{x:59.5,y:47.5,links:[6]},
 {x:39,y:69,links:[1]},{x:61,y:69,links:[3]},{x:88,y:53,links:[10]}
];
const roamNodes=[0,1,2,3,4,5,6,7,8,9,10];const seatNodes=[11,12,13,14,15,16];const robots=new Map();const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function distance(a,b){return Math.hypot((a.x-b.x)*1.5,a.y-b.y);}
function findRoute(start,end){const distances=navigation.map(()=>Infinity),previous=[],pending=new Set(navigation.map((_,i)=>i));distances[start]=0;while(pending.size){let u=[...pending].sort((a,b)=>distances[a]-distances[b])[0];pending.delete(u);if(u===end)break;for(const v of navigation[u].links){let d=distances[u]+distance(navigation[u],navigation[v]);if(d<distances[v]){distances[v]=d;previous[v]=u;}}}let result=[end];while(result[0]!==start){if(previous[result[0]]===undefined)throw new Error('Unreachable robot station');result.unshift(previous[result[0]]);}return result.slice(1);}
function nearestNode(r){return navigation.reduce((best,n,i)=>distance(r,n)<distance(r,navigation[best])?i:best,0);}
function setRoute(r,target){const start=nearestNode(r);r.path=[start,...findRoute(start,target)];r.target=target;}
function releaseRobot(id){const r=robots.get(id);if(!r)return;if(r.arrival){r.arrival();r.arrival=null;}r.mode='roaming';r.element.classList.remove('seated');setRoute(r,roamNodes[Math.floor(Math.random()*roamNodes.length)]);}
async function summon(id){const a=agents.find(a=>a.id===id),r=robots.get(id);if(r.mode==='seated')return;if(r.arrival)return r.promise;a.status='called';a.logs.push('Called to the control desk.');r.mode='called';setRoute(r,a.seatNode);renderOffice();r.promise=new Promise(resolve=>r.arrival=resolve);if(reducedMotion){const seat=navigation[a.seatNode];r.x=seat.x;r.y=seat.y;r.path=[];arrive(r);}return r.promise;}
function arrive(r){if(r.mode==='called'){r.mode='seated';r.element.classList.add('seated');const a=agents.find(a=>a.id===r.id);if(a.status!=='paused')a.status=a.id==='diagnosis'?'reviewing':'working';a.logs.push('Arrived and seated at the control desk.');renderOffice();if(r.arrival){r.arrival();r.arrival=null;}}else if(r.mode==='roaming'){r.restUntil=performance.now()+1000+Math.random()*1800;}}
function initRobots(){agents.forEach((a,i)=>{a.status='idle';a.screens=screenPixels[i].map(screenCoordinates);a.seatNode=seatNodes[i];const e=document.createElement('button');e.className='robot';e.dataset.agent=a.id;e.setAttribute('aria-label',a.name+' robot');e.style.setProperty('--agent',a.color);e.innerHTML='<span class="robot-sprite"></span><span class="robot-badge">'+badge(a.id)+'</span>';$('robots').appendChild(e);const spawn=[0,1,2,3,4,8][i];const r={id:a.id,x:navigation[spawn].x,y:navigation[spawn].y,path:[],mode:'roaming',element:e,restUntil:performance.now()+i*650};robots.set(a.id,r);positionRobot(r);});}
function positionRobot(r){r.element.style.left=r.x+'%';r.element.style.top=r.y+'%';r.element.style.zIndex=Math.round(r.y*10);r.element.dataset.motion=r.path.length?'walking':r.mode;r.element.style.setProperty('--facing',r.facing||1);if(r.chair)r.chair.hidden=activeTheme!=='cartoon'||r.mode==='seated';}
let lastFrame;function animateRobots(now){let dt=Math.min((now-(lastFrame??now))/1000,.08);lastFrame=now;if(embeddedRoom&&document.documentElement.dataset.visible!=='true'){requestAnimationFrame(animateRobots);return;}for(const r of robots.values()){const a=agents.find(a=>a.id===r.id);if(a.status==='paused'){r.element.dataset.motion='paused';continue;}if(r.path.length){const target=navigation[r.path[0]],d=distance(r,target),step=dt*17;if(d<=step){r.x=target.x;r.y=target.y;r.path.shift();if(!r.path.length)arrive(r);}else{const ratio=step/d;r.facing=target.x<r.x?-1:1;r.x+=(target.x-r.x)*ratio;r.y+=(target.y-r.y)*ratio;}}else if(r.mode==='roaming'&&!reducedMotion&&now>r.restUntil){let target=roamNodes[Math.floor(Math.random()*roamNodes.length)];setRoute(r,target);}positionRobot(r);}requestAnimationFrame(animateRobots);}

const networkPositions={supervisor:[16,50],data:[50,15],ml:[50,38],fault:[50,62],expert:[50,85],diagnosis:[84,50]};
const networkLinks=[...['data','ml','fault','expert'].map(id=>['supervisor',id]),...['data','ml','fault','expert'].map(id=>[id,'diagnosis']),['supervisor','diagnosis'],['diagnosis','supervisor']];
const activeLinks=new Map();
function edgePath(from, to, boxes, height) {
  const source = boxes.get(from);
  const target = boxes.get(to);
  if (from === 'diagnosis' || (from === 'supervisor' && to === 'diagnosis')) {
    const returning = from === 'diagnosis';
    const direction = returning ? 1 : -1;
    const rail = height * (returning ? .95 : .05);
    const startY = source.y + direction * (source.height / 2 + 5);
    const endY = target.y + direction * (target.height / 2 + 6);
    return `M ${source.x} ${startY} V ${rail} H ${target.x} V ${endY}`;
  }

  const fromSupervisor = from === 'supervisor';
  const specialist = fromSupervisor ? to : from;
  const port = ['data', 'ml', 'fault', 'expert'].indexOf(specialist) - 1.5;
  const startX = source.x + source.width / 2 + 1;
  const endX = target.x - target.width / 2 - 2;
  const startY = source.y + (fromSupervisor ? port * source.height / 5 : 0);
  const endY = target.y + (to === 'diagnosis' ? port * target.height / 5 : 0);
  const landingX = endX - 7;
  const middle = (startX + landingX) / 2;
  return `M ${startX} ${startY} C ${middle} ${startY}, ${middle} ${endY}, ${landingX} ${endY} H ${endX}`;
}

function renderNetworkEdges() {
  const canvas = $('network-nodes');
  const { clientWidth: width, clientHeight: height } = canvas;
  if (!width || !height) return;

  const boxes = new Map([...canvas.children].map(node => [node.dataset.agent, {
    x: node.offsetLeft, y: node.offsetTop, width: node.offsetWidth, height: node.offsetHeight
  }]));
  const edges = $('network-edges');
  edges.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const markers = agents.map(agent => `
    <marker id="arrow-${agent.id}" markerWidth="8" markerHeight="8" refX="7" refY="4"
      orient="auto" markerUnits="userSpaceOnUse">
      <path d="M1 1 L7 4 L1 7 Z" fill="${agent.color}" style="--edge:${agent.color}"/>
    </marker>`).join('');
  const links = networkLinks.map(([from, to]) => {
    const source = agents.find(agent => agent.id === from);
    const target = agents.find(agent => agent.id === to);
    const active = activeLinks.has(from + '-' + to);
    const path = edgePath(from, to, boxes, height);
    return `<g class="network-link ${active ? 'active' : ''}" style="--edge:${source.color}">
      <path class="edge-base" fill="none" d="${path}"/>
      <path class="edge-flow" fill="none" d="${path}"/>
      <path class="edge-arrow" fill="none" d="${path}" marker-end="url(#arrow-${from})"/>
      <title>${esc(source.name)} to ${esc(target.name)}</title>
    </g>`;
  }).join('');
  edges.innerHTML = `<defs>${markers}</defs>${links}`;
}

function renderNetwork() {
  $('network-nodes').innerHTML = agents.map(agent => {
    const [x, y] = networkPositions[agent.id];
    const active = [...activeLinks.keys()].some(key => key.split('-').includes(agent.id));
    return `<button class="network-node ${active ? 'active' : ''}" data-agent="${agent.id}"
      style="left:${x}%;top:${y}%;--agent:${agent.color}" aria-label="Inspect ${agent.name}, ${agent.status}">
      <span class="node-orb"><img class="network-robot" src="${robotAsset(agent.id)}" alt="" aria-hidden="true"></span>
      <strong>${esc(agent.name)}</strong><small><span class="dot ${agent.status}"></span>${agent.status}</small>
    </button>`;
  }).join('');
  renderNetworkEdges();
}
function clearNetworkActivity(){for(const timer of activeLinks.values())clearTimeout(timer);activeLinks.clear();renderNetwork();}
function highlightHandoff(from,to){const resolve=name=>(agents.find(a=>a.name===name)||{}).id||({'Final review station':'diagnosis','Fault Diagnoser':'diagnosis','Specialist team':'specialists','Four specialists':'specialists'}[name]);const source=resolve(from),target=resolve(to);const pairs=target==='specialists'?networkLinks.filter(([f,t])=>f===source&&t!=='diagnosis'):networkLinks.filter(([f,t])=>f===source&&t===target);for(const [f,t] of pairs){const key=f+'-'+t;clearTimeout(activeLinks.get(key));activeLinks.set(key,setTimeout(()=>{activeLinks.delete(key);renderNetwork();},4200));}renderNetwork();}
const inputDialog = $('agent-input');
const inputFrame = $('input-frame');
let inputTrigger;

document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-agent]');
  if (!trigger) return;

  const agent = agents.find(({ id }) => id === trigger.dataset.agent);
  if (!agent) return;

  inputTrigger = trigger;
  const appearance = document.documentElement.dataset.appearance || 'classic';
  const params = new URLSearchParams({ appearance, view: 'embedded' });
  const hasReport = ['supervisor', 'fault', 'diagnosis'].includes(agent.id);
  if (agent.id === 'expert') {
    params.set('figure', 'graph');
    inputFrame.src = '../demethanizer/index.html?' + params;
  } else {
    params.set('agent', agent.id);
    inputFrame.src = (hasReport ? 'agent-report.html?' : 'input-figure.html?') + params;
  }
  inputFrame.title = agent.name + (hasReport ? ' report' : ' input figure');
  inputDialog.setAttribute('aria-label', inputFrame.title);
  inputDialog.showModal();
  clearTimeout(replayTimer);
});

$('close-input').onclick = () => inputDialog.close();
inputDialog.addEventListener('close', () => {
  if (inputDialog.open) return;
  inputFrame.src = 'about:blank';
  if (inputTrigger.isConnected) {
    inputTrigger.focus();
  } else {
    document.querySelector('.' + inputTrigger.classList[0] +
      '[data-agent="' + inputTrigger.dataset.agent + '"]')?.focus();
  }
});

initRobots();
setTheme('classic');
new ResizeObserver(renderNetworkEdges).observe($('network-nodes'));
document.fonts.ready.then(renderNetworkEdges);
requestAnimationFrame(animateRobots);

const embeddedRoom = document.documentElement.dataset.view === 'embedded';
let replayTimer;

function scheduleInvestigation(delay = 0) {
  clearTimeout(replayTimer);
  if (running || inputDialog.open || document.hidden ||
      (embeddedRoom && document.documentElement.dataset.visible !== 'true')) return;

  replayTimer = setTimeout(async () => {
    try {
      await runWorkflow();
    } finally {
      scheduleInvestigation(4500);
    }
  }, delay);
}

new MutationObserver(() => scheduleInvestigation()).observe(document.documentElement, {
  attributes: true, attributeFilter: ['data-visible']
});
document.addEventListener('visibilitychange', () => scheduleInvestigation());
inputDialog.addEventListener('close', () => scheduleInvestigation(1500));
scheduleInvestigation();
