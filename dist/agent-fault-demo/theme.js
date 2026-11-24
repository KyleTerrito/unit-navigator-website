// Theme artwork lives together so new themes can be added without changing agent behavior.
const roomThemes = {
  classic: { label: 'Classic control room', folder: 'assets/themes/classic' },
  cartoon: { label: 'Cartoon crew', folder: 'assets/themes/cartoon' }
};
let activeTheme = 'classic';
function robotAsset(id) {
  const folder = roomThemes[activeTheme].folder;
  return activeTheme === 'cartoon' ? `${folder}/robots/${id}.png` : `${folder}/robot.webp`;
}
function setTheme(value) {
  activeTheme = Object.hasOwnProperty.call(roomThemes, value) ? value : 'classic';
  document.documentElement.dataset.theme = activeTheme;
  const art = document.getElementById('office-art');
  art.src = `${roomThemes[activeTheme].folder}/${activeTheme === 'cartoon' ? 'office-chairless.png' : 'office.webp'}`;
  art.alt = `${roomThemes[activeTheme].label}: six empty workstations with a supervisor office, four specialist desks, and a final review office.`;
  for (const agent of agents) {
    const robot = robots.get(agent.id);
    if (!robot) continue;
    if (!robot.chair) {
      const chair = document.createElement('span');
      chair.className = 'station-chair';
      chair.setAttribute('aria-hidden', 'true');
      const seat = navigation[agent.seatNode];
      chair.style.left = seat.x + '%';
      chair.style.top = seat.y + '%';
      chair.style.zIndex = Math.round(seat.y * 10) - 1;
      document.getElementById('scene').appendChild(chair);
      robot.chair = chair;
    }
    robot.element.style.setProperty('--robot-art', `url("${robotAsset(agent.id)}")`);
    robot.element.style.setProperty('--robot-seated-art', `url("${activeTheme === 'cartoon' ? roomThemes.cartoon.folder + '/robot-seated-rear.png' : roomThemes.classic.folder + '/robot-seated.webp'}")`);
    // Start the crew at their workstations; releasing an agent still enables roaming.
    if (activeTheme === 'cartoon' && robot.mode === 'roaming' && agent.status === 'idle') {
      const seat = navigation[agent.seatNode];
      robot.x = seat.x;
      robot.y = seat.y;
      robot.path = [];
      robot.mode = 'seated';
      robot.element.classList.add('seated');
      positionRobot(robot);
    }
    robot.chair.hidden = activeTheme !== 'cartoon' || robot.mode === 'seated';
  }
  renderOffice();
  try { localStorage.setItem('process-room-theme', activeTheme); } catch {}
}
