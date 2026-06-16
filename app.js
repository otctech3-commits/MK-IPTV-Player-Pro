// ===== MK IPTV PLAYER PRO - APP.JS =====

let player;
let currentChannel = null;
let playlists = {};
let currentPlaylist = 'default';
let watchHistory = [];
let audioTracks = [];
let startTime = null;
let uptimeInterval = null;

// Init
window.onload = () => {
  initPlayer();
  loadData();
  loadDefaultPlaylist();
};

function initPlayer() {
  player = videojs('videoPlayer', {
    fluid: true,
    responsive: true,
    playbackRates: [0.5, 1, 1.5, 2],
    html5: {
      hls: {
        enableLowInitialPlaylist: true,
        smoothQualityChange: true,
        overrideNative: true
      }
    }
  });

  player.on('loadedmetadata', () => {
    updateAudioTracks();
    updateVideoQuality();
    document.getElementById('playerOverlay').classList.add('hidden');
    document.getElementById('infoBar').style.display = 'flex';
    startUptime();
  });

  player.on('error', () => {
    showNotification('Stream error. Try another source or VLC mode.', 'error');
  });
}

function loadData() {
  const saved = localStorage.getItem('mkiptv_data');
  if (saved) {
    const data = JSON.parse(saved);
    playlists = data.playlists || {};
    watchHistory = data.history || [];
    renderPlaylists();
    renderRecent();
  }
}

function saveData() {
  localStorage.setItem('mkiptv_data', JSON.stringify({
    playlists,
    history: watchHistory
  }));
}

function loadDefaultPlaylist() {
  // Add sample M3U if you want - leave empty for user
  playlists['default'] = { name: 'Default', channels: [] };
  renderChannels();
}

// ===== PLAYLIST MANAGEMENT =====
function showAddPlaylist() {
  document.getElementById('addPlaylistModal').classList.add('active');
}

function showAddTab(tab) {
  document.querySelectorAll('.add-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`addTab-${tab}`).classList.add('active');
  event.target.classList.add('active');
}

function addPlaylistByUrl() {
  const name = document.getElementById('playlistName').value || 'Playlist';
  const url = document.getElementById('playlistUrl').value;
  
  if (!url) return alert('Enter M3U URL');
  
  fetch(url)
   .then(res => res.text())
   .then(data => parseM3U(data, name))
   .catch(() => alert('Failed to load playlist. Check URL/CORS.'));
}

function handleM3UFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const name = document.getElementById('filePlaylistName').value || file.name.replace('.m3u', '');
  const reader = new FileReader();
  reader.onload = (e) => parseM3U(e.target.result, name);
  reader.readAsText(file);
}

function parseM3U(content, name) {
  const lines = content.split('\n');
  const channels = [];
  let currentChannel = {};
  
  lines.forEach(line => {
    line = line.trim();
    if (line.startsWith('#EXTINF:')) {
      const titleMatch = line.match(/,(.+)$/);
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      const groupMatch = line.match(/group-title="([^"]+)"/);
      
      currentChannel = {
        name: titleMatch? titleMatch[1] : 'Unknown',
        logo: logoMatch? logoMatch[1] : '',
        group: groupMatch? groupMatch[1] : 'General',
        id: Date.now() + Math.random()
      };
    } else if (line &&!line.startsWith('#')) {
      currentChannel.url = line;
      if (currentChannel.name) channels.push({...currentChannel});
    }
  });
  
  const id = 'pl_' + Date.now();
  playlists[id] = { name, channels };
  saveData();
  renderPlaylists();
  switchPlaylist(id);
  closeModal('addPlaylistModal');
  showNotification(`Added ${channels.length} channels`, 'success');
}

function addSingleChannel() {
  const name = document.getElementById('singleName').value;
  const url = document.getElementById('singleUrl').value;
  const logo = document.getElementById('singleLogo').value;
  
  if (!name ||!url) return alert('Enter name and URL');
  
  if (!playlists['default']) playlists['default'] = { name: 'Default', channels: [] };
  
  playlists['default'].channels.push({
    id: Date.now(),
    name, url, logo,
    group: 'Custom'
  });
  
  saveData();
  renderChannels();
  closeModal('addPlaylistModal');
  showNotification('Channel added', 'success');
}

function renderPlaylists() {
  const tabs = document.getElementById('playlistTabs');
  tabs.innerHTML = Object.keys(playlists).map(id => `
    <button class="playlist-tab ${id === currentPlaylist? 'active' : ''}" onclick="switchPlaylist('${id}')">
      <i class="fa-solid fa-list"></i> ${playlists[id].name} (${playlists[id].channels.length})
    </button>
  `).join('');
}

function switchPlaylist(id) {
  currentPlaylist = id;
  renderPlaylists();
  renderChannels();
}

function renderChannels() {
  const list = document.getElementById('channelsList');
  const channels = playlists[currentPlaylist]?.channels || [];
  
  if (channels.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-satellite-dish"></i>
        <p>No channels in this playlist</p>
      </div>
    `;
    return;
  }
  
  list.innerHTML = channels.map(ch => `
    <div class="channel-item ${currentChannel?.id === ch.id? 'active' : ''}" onclick="playChannel('${ch.id}')">
      <img src="${ch.logo || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40"%3E%3Crect fill="%23334155" width="40" height="40"/%3E%3Ctext x="50%25" y="50%25" font-size="20" fill="%2394a3b8" text-anchor="middle" dy=".3em"%3ETV%3C/text%3E%3C/svg%3E'}" alt="">
      <div class="channel-item-info">
        <div class="channel-item-name">${ch.name}</div>
        <div class="channel-item-group">${ch.group}</div>
      </div>
    </div>
  `).join('');
}

// ===== PLAYER FUNCTIONS =====
function playChannel(id) {
  const channel = playlists[currentPlaylist].channels.find(c => c.id == id);
  if (!channel) return;
  
  currentChannel = channel;
  const mode = document.getElementById('playerMode').value;
  
  if (mode === 'external') {
    openInVLC();
    return;
  }
  
  player.src({ src: channel.url, type: 'application/x-mpegURL' });
  player.play();
  
  // Update UI
  document.getElementById('channelName').textContent = channel.name;
  document.getElementById('channelLogo').src = channel.logo || '';
  document.getElementById('channelInfo').style.display = 'flex';
  document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
  event?.currentTarget?.classList.add('active');
  
  // Add to history
  addToHistory(channel);
  
  // VLC button
  document.getElementById('vlcBtn').style.display = 'inline-flex';
}

function changePlayerMode() {
  const mode = document.getElementById('playerMode').value;
  if (mode === 'vlc-like') {
    player.tech_.el_.setAttribute('controlsList', 'nodownload');
    showNotification('VLC-like mode: Enhanced buffering', 'info');
  }
  if (currentChannel) playChannel(currentChannel.id);
}

function openInVLC() {
  if (!currentChannel) return;
  const vlcUrl = `vlc://${currentChannel.url}`;
  window.location.href = vlcUrl;
  
  // Fallback
  setTimeout(() => {
    navigator.clipboard.writeText(currentChannel.url);
    showNotification('URL copied. Open in VLC manually.', 'info');
  }, 1000);
}

function updateAudioTracks() {
  const tracks = player.audioTracks();
  const select = document.getElementById('audioTrack');
  select.innerHTML = '<option value="-1">Default</option>';
  
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    select.innerHTML += `<option value="${i}">${track.label || track.language || 'Track ' + (i+1)}</option>`;
  }
  audioTracks = tracks;
}

function changeAudioTrack() {
  const index = document.getElementById('audioTrack').value;
  for (let i = 0; i < audioTracks.length; i++) {
    audioTracks[i].enabled = (i == index);
  }
}

function updateVideoQuality() {
  const levels = player.qualityLevels();
  let currentLevel = 'Auto';
  for (let i = 0; i < levels.length; i++) {
    if (levels[i].enabled) currentLevel = levels[i].height + 'p';
  }
  document.getElementById('videoQuality').textContent = currentLevel;
}

function startUptime() {
  startTime = Date.now();
  clearInterval(uptimeInterval);
  uptimeInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    document.getElementById('uptime').textContent = `${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
    
    // Buffer health
    const buffered = player.buffered();
    const health = buffered.length > 0? 'Good' : 'Buffering';
    document.getElementById('bufferHealth').textContent = health;
  }, 1000);
}

// ===== SEARCH =====
function searchChannels() {
  const query = document.getElementById('searchChannel').value.toLowerCase();
  const items = document.querySelectorAll('.channel-item');
  items.forEach(item => {
    const name = item.querySelector('.channel-item-name').textContent.toLowerCase();
    item.style.display = name.includes(query)? 'flex' : 'none';
  });
}

// ===== HISTORY =====
function addToHistory(channel) {
  watchHistory = watchHistory.filter(c => c.id!== channel.id);
  watchHistory.unshift({...channel, timestamp: Date.now()});
  watchHistory = watchHistory.slice(0, 10);
  saveData();
  renderRecent();
}

function renderRecent() {
    const container = document.getElementById('recentChannels');
  if (watchHistory.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">No recent channels</p>';
    return;
  }
  
  container.innerHTML = watchHistory.map(ch => `
    <div class="recent-item" onclick="playChannelFromHistory('${ch.id}')">
      <img src="${ch.logo || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40"%3E%3Crect fill="%23334155" width="40" height="40"/%3E%3C/svg%3E'}" alt="">
      <div>
        <div style="font-weight:600;font-size:14px">${ch.name}</div>
        <div style="font-size:12px;color:var(--text-muted)">${new Date(ch.timestamp).toLocaleTimeString()}</div>
      </div>
    </div>
  `).join('');
}

function playChannelFromHistory(id) {
  for (let plId in playlists) {
    const channel = playlists[plId].channels.find(c => c.id == id);
    if (channel) {
      currentPlaylist = plId;
      playChannel(id);
      switchPlaylist(plId);
      break;
    }
  }
}

// ===== UI FUNCTIONS =====
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  event.target.closest('.nav-item').classList.add('active');
  
  if (page === 'analytics') loadAnalytics();
  if (page === 'calendar') renderCalendar();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

function showSettings() {
  document.getElementById('settingsModal').classList.add('active');
}

function showNotifications() {
  showNotification('No new notifications', 'info');
}

function showNotification(msg, type = 'success') {
  const colors = { success: '#10b981', error: '#ef4444', info: '#3b82f6' };
  const toast = document.createElement('div');
  toast.style.cssText = `
    position:fixed;top:80px;right:20px;background:${colors[type]};color:#fff;
    padding:15px 25px;border-radius:8px;font-weight:600;z-index:9999;
    box-shadow:0 10px 30px rgba(0,0,0,0.3);animation:slideIn 0.3s;
  `;
  toast.innerHTML = `<i class="fa-solid fa-${type === 'error'? 'x' : 'check'}"></i> ${msg}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ===== SETTINGS =====
function clearAllData() {
  if (confirm('Delete all playlists and history? This cannot be undone.')) {
    localStorage.removeItem('mkiptv_data');
    playlists = {};
    watchHistory = [];
    location.reload();
  }
}

// ===== CALENDAR =====
let currentMonth = new Date();

function renderCalendar() {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  document.getElementById('calendarMonth').textContent = 
    currentMonth.toLocaleDateString('en', { month: 'long', year: 'numeric' });
  
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const grid = document.getElementById('calendarGrid');
  
  let html = '';
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(day => {
    html += `<div style="font-weight:700;text-align:center;padding:10px">${day}</div>`;
  });
  
  for (let i = 0; i < firstDay; i++) {
    html += '<div class="calendar-day" style="opacity:0.3"></div>';
  }
  
  const today = new Date();
  for (let day = 1; day <= daysInMonth; day++) {
    const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
    html += `<div class="calendar-day ${isToday? 'today' : ''}">
      <div class="calendar-day-number">${day}</div>
    </div>`;
  }
  
  grid.innerHTML = html;
}

function prevMonth() {
  currentMonth.setMonth(currentMonth.getMonth() - 1);
  renderCalendar();
}

function nextMonth() {
  currentMonth.setMonth(currentMonth.getMonth() + 1);
  renderCalendar();
}

// ===== POMODORO TIMER =====
let timerInterval = null;
let timerMinutes = 25;
let timerSeconds = 0;
let isRunning = false;
let isBreak = false;
let pomodoros = 0;

function startTimer() {
  if (isRunning) return;
  isRunning = true;
  
  timerInterval = setInterval(() => {
    if (timerSeconds === 0) {
      if (timerMinutes === 0) {
        // Timer finished
        clearInterval(timerInterval);
        isRunning = false;
        
        if (!isBreak) {
          pomodoros++;
          document.getElementById('pomodorosCompleted').textContent = pomodoros;
          showNotification('Pomodoro complete! Take a break.', 'success');
          timerMinutes = 5;
          isBreak = true;
          document.getElementById('timerLabel').textContent = 'Break Time';
        } else {
          showNotification('Break over! Back to work.', 'info');
          timerMinutes = 25;
          isBreak = false;
          document.getElementById('timerLabel').textContent = 'Focus Time';
        }
        updateTimerDisplay();
        return;
      }
      timerMinutes--;
      timerSeconds = 59;
    } else {
      timerSeconds--;
    }
    updateTimerDisplay();
  }, 1000);
}

function pauseTimer() {
  clearInterval(timerInterval);
  isRunning = false;
}

function resetTimer() {
  clearInterval(timerInterval);
  isRunning = false;
  timerMinutes = isBreak? 5 : 25;
  timerSeconds = 0;
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const display = `${timerMinutes.toString().padStart(2,'0')}:${timerSeconds.toString().padStart(2,'0')}`;
  document.getElementById('timerTime').textContent = display;
  
  // Update circle
  const totalSeconds = (isBreak? 5 : 25) * 60;
  const currentSeconds = timerMinutes * 60 + timerSeconds;
  const progress = (totalSeconds - currentSeconds) / totalSeconds;
  const offset = 880 - (880 * progress);
  document.getElementById('timerProgress').style.strokeDashoffset = offset;
}

// ===== ANALYTICS =====
function loadAnalytics() {
  // Mock data for demo - replace with real tracking
  const ctx1 = document.getElementById('tasksChart');
  if (ctx1 &&!ctx1.chart) {
    ctx1.chart = new Chart(ctx1, {
      type: 'line',
      data: {
        labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
        datasets: [{
          label: 'Channels Watched',
          data: [12, 19, 15, 25, 22, 30, 28],
          borderColor: '#3b82f6',
          tension: 0.4
        }]
      },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });
  }
  
  const ctx2 = document.getElementById('productivityChart');
  if (ctx2 &&!ctx2.chart) {
    ctx2.chart = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: ['Active', 'Idle'],
        datasets: [{ data: [75, 25], backgroundColor: ['#10b981', '#334155'] }]
      }
    });
  }
  
  const ctx3 = document.getElementById('timeChart');
  if (ctx3 &&!ctx3.chart) {
    ctx3.chart = new Chart(ctx3, {
      type: 'bar',
      data: {
        labels: ['Morning','Afternoon','Evening','Night'],
        datasets: [{
          label: 'Hours',
          data: [2, 5, 8, 3],
          backgroundColor: '#3b82f6'
        }]
      },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });
  }
  
  document.getElementById('categoriesList').innerHTML = `
    <div class="category-item"><span>Sports</span><b>45%</b></div>
    <div class="category-item"><span>News</span><b>30%</b></div>
    <div class="category-item"><span>Movies</span><b>15%</b></div>
    <div class="category-item"><span>Music</span><b>10%</b></div>
  `;
}

// ===== TEAM =====
function inviteMember() {
  const email = prompt('Enter team member email:');
  if (email) showNotification(`Invite sent to ${email}`, 'success');
}

// ===== STATS UPDATE =====
function updateStats() {
  let totalChannels = 0;
  Object.values(playlists).forEach(pl => totalChannels += pl.channels.length);
  
  document.getElementById('totalTasks').textContent = totalChannels;
  document.getElementById('completedTasks').textContent = watchHistory.length;
  document.getElementById('pendingTasks').textContent = Math.max(0, totalChannels - watchHistory.length);
  
  const used = Object.keys(playlists).length;
  document.getElementById('boardsUsed').textContent = used;
  document.getElementById('storageFill').style.width = (used / 3 * 100) + '%';
}

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', (e) => {
  if (e.key === ' ' && e.target.tagName!== 'INPUT') {
    e.preventDefault();
    if (player.paused()) player.play();
    else player.pause();
  }
  if (e.key === 'f' && e.target.tagName!== 'INPUT') {
    if (player.isFullscreen()) player.exitFullscreen();
    else player.requestFullscreen();
  }
  if (e.key === 'm' && e.target.tagName!== 'INPUT') {
    player.muted(!player.muted());
  }
});

// ===== COLOR THEME =====
let selectedColor = '#3b82f6';
function selectColor(color) {
  selectedColor = color;
  document.querySelectorAll('.color-option').forEach(el => el.classList.remove('active'));
  event.target.classList.add('active');
}

function confirmCreateBoard() {
  const name = document.getElementById('boardNameInput').value;
  const desc = document.getElementById('boardDescInput').value;
  const template = document.getElementById('boardTemplate').value;
  
  if (!name) return alert('Enter board name');
  if (Object.keys(playlists).length >= 3) return alert('Free plan: 3 boards max. Upgrade to Pro.');
  
  const id = 'board_' + Date.now();
  playlists[id] = { 
    name, 
    desc, 
    color: selectedColor,
    channels: [],
    columns: template === 'kanban'? ['To Do', 'Doing', 'Done'] : ['List']
  };
  
  saveData();
  renderPlaylists();
  updateStats();
  closeModal('createBoardModal');
  showNotification('Board created!', 'success');
}
