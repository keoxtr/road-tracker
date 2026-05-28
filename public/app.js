const state = {
  clientId: localStorage.getItem("roadTrackerClientId") || crypto.randomUUID(),
  eventSource: null,
  watchId: null,
  roomId: "",
  name: "",
  color: localStorage.getItem("roadTrackerColor") || randomColor(),
  myLocation: null,
  members: [],
  messages: [],
  peerLocation: null,
  followMe: true,
  mediaRecorder: null,
  audioChunks: [],
  recordingStartedAt: 0
};

const els = {
  room: document.querySelector("#roomInput"),
  name: document.querySelector("#nameInput"),
  join: document.querySelector("#joinButton"),
  center: document.querySelector("#centerButton"),
  status: document.querySelector("#connectionStatus"),
  install: document.querySelector("#installButton"),
  installPanel: document.querySelector("#installPanel"),
  installText: document.querySelector("#installText"),
  peerName: document.querySelector("#peerName"),
  distance: document.querySelector("#distance"),
  freshness: document.querySelector("#freshness"),
  navigate: document.querySelector("#navigateButton"),
  messageList: document.querySelector("#messageList"),
  messageForm: document.querySelector("#messageForm"),
  messageInput: document.querySelector("#messageInput"),
  record: document.querySelector("#recordButton"),
  recordingStatus: document.querySelector("#recordingStatus")
};

els.room.value = localStorage.getItem("roadTrackerRoom") || "TATIL2026";
els.name.value = localStorage.getItem("roadTrackerName") || `Arac ${Math.floor(Math.random() * 90 + 10)}`;
localStorage.setItem("roadTrackerColor", state.color);
localStorage.setItem("roadTrackerClientId", state.clientId);

let installPrompt = null;

const map = L.map("map", {
  zoomControl: false
}).setView([39.0, 35.0], 6);

L.control.zoom({ position: "bottomleft" }).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap"
}).addTo(map);

const markers = new Map();
const pathLine = L.polyline([], {
  color: "#0f766e",
  weight: 4,
  opacity: 0.72,
  dashArray: "8 10"
}).addTo(map);

function randomColor() {
  const colors = ["#006d77", "#d62828", "#2a9d8f", "#5b2a86", "#f77f00", "#1d4ed8"];
  return colors[Math.floor(Math.random() * colors.length)];
}

function setStatus(text, isError = false) {
  els.status.textContent = text;
  els.status.classList.toggle("error", isError);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function updateInstallUi() {
  if (isStandalone()) {
    els.install.textContent = "Kurulu";
    els.install.classList.add("installed");
    els.installPanel.hidden = true;
    return;
  }

  els.install.classList.remove("installed");
  els.install.textContent = "Kur";
}

function showInstallHelp() {
  els.installPanel.hidden = false;
  if (installPrompt) {
    els.installText.textContent = "Açılan pencerede Yükle seçeneğine basın. Sonra uygulama telefonunuzun ana ekranına gelir.";
    return;
  }

  if (isIos()) {
    els.installText.textContent = "iPhone için Safari'de paylaş düğmesine basın, ardından Ana Ekrana Ekle seçeneğini seçin.";
    return;
  }

  els.installText.textContent = "Tarayıcı menüsünden Ana ekrana ekle veya Uygulamayı yükle seçeneğini seçin.";
}

async function installApp() {
  if (isStandalone()) {
    showInstallHelp();
    return;
  }

  if (!installPrompt) {
    showInstallHelp();
    return;
  }

  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => null);
  installPrompt = null;
  updateInstallUi();
}

function makeIcon(member) {
  const initial = (member.name || "A").trim().charAt(0).toUpperCase();
  return L.divIcon({
    html: `<div class="car-marker" style="background:${member.color}">${initial}</div>`,
    className: "",
    iconSize: [34, 34],
    iconAnchor: [17, 17]
  });
}

function upsertMarker(member) {
  if (!member.location) return;
  const latLng = [member.location.lat, member.location.lng];
  const label = `${member.name}<br>${member.id === state.clientId ? "Sen" : "Diğer araç"}`;

  if (!markers.has(member.id)) {
    markers.set(member.id, L.marker(latLng, { icon: makeIcon(member) }).addTo(map));
  }

  markers.get(member.id).setLatLng(latLng).setIcon(makeIcon(member)).bindPopup(label);
}

function pruneMarkers() {
  const ids = new Set(state.members.map((member) => member.id));
  for (const [id, marker] of markers.entries()) {
    if (!ids.has(id)) {
      marker.remove();
      markers.delete(id);
    }
  }
}

function renderMembers(members) {
  state.members = members;
  members.forEach(upsertMarker);
  pruneMarkers();

  const mine = members.find((member) => member.id === state.clientId);
  const others = members.filter((member) => member.id !== state.clientId && member.location);
  const peer = others[0];
  state.peerLocation = peer?.location || null;
  els.navigate.disabled = !state.peerLocation;

  if (peer) {
    els.peerName.textContent = peer.name;
    els.freshness.textContent = formatFreshness(peer.updatedAt);
  } else {
    els.peerName.textContent = members.length > 1 ? "Konum bekleniyor" : "Bekleniyor";
    els.distance.textContent = "-";
    els.freshness.textContent = "-";
  }

  if (mine?.location && peer?.location) {
    const dist = distanceMeters(mine.location, peer.location);
    els.distance.textContent = formatDistance(dist);
    pathLine.setLatLngs([
      [mine.location.lat, mine.location.lng],
      [peer.location.lat, peer.location.lng]
    ]);
  } else {
    pathLine.setLatLngs([]);
  }

  if (state.followMe && mine?.location) {
    map.setView([mine.location.lat, mine.location.lng], Math.max(map.getZoom(), 15));
  }
}

function openNavigation() {
  if (!state.peerLocation) {
    setStatus("Hedef yok", true);
    return;
  }

  const destination = `${state.peerLocation.lat},${state.peerLocation.lng}`;
  const origin = state.myLocation ? `&origin=${state.myLocation.lat},${state.myLocation.lng}` : "";
  const url = `https://www.google.com/maps/dir/?api=1${origin}&destination=${destination}&travelmode=driving`;
  window.open(url, "_blank", "noopener");
}

function renderMessages(messages) {
  state.messages = messages;
  els.messageList.textContent = "";

  if (!messages.length) {
    const empty = document.createElement("div");
    empty.className = "message-empty";
    empty.textContent = "Henüz mesaj yok";
    els.messageList.append(empty);
    return;
  }

  for (const message of messages) {
    const item = document.createElement("article");
    item.className = `message${message.senderId === state.clientId ? " mine" : ""}`;

    const meta = document.createElement("div");
    meta.className = "message-meta";

    const dot = document.createElement("span");
    dot.className = "message-dot";
    dot.style.background = message.color || "#006d77";

    const sender = document.createElement("span");
    sender.textContent = `${message.senderName || "Araç"} - ${formatClock(message.createdAt)}`;

    meta.append(dot, sender);
    item.append(meta);

    if (message.type === "audio") {
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.preload = "metadata";
      audio.src = message.audio;
      item.append(audio);
    } else {
      const text = document.createElement("div");
      text.className = "message-text";
      text.textContent = message.text;
      item.append(text);
    }

    els.messageList.append(item);
  }

  els.messageList.scrollTop = els.messageList.scrollHeight;
}

function renderRoom(payload) {
  if (Array.isArray(payload)) {
    renderMembers(payload);
    return;
  }

  renderMembers(payload.members || []);
  renderMessages(payload.messages || []);
}

function distanceMeters(a, b) {
  const radius = 6371000;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatFreshness(timestamp) {
  if (!timestamp) return "-";
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 10) return "Simdi";
  if (seconds < 60) return `${seconds} sn`;
  return `${Math.round(seconds / 60)} dk`;
}

function formatClock(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function startGeolocation() {
  if (!navigator.geolocation) {
    setStatus("GPS yok", true);
    return;
  }

  if (state.watchId) navigator.geolocation.clearWatch(state.watchId);

  state.watchId = navigator.geolocation.watchPosition(
    (position) => {
      state.myLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        heading: position.coords.heading,
        speed: position.coords.speed
      };
      sendLocation(state.myLocation);
      setStatus("Canli");
    },
    (error) => {
      const message = error.code === error.PERMISSION_DENIED ? "Konum izni gerekli" : "GPS bekleniyor";
      setStatus(message, true);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 4000,
      timeout: 12000
    }
  );
}

async function postJson(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(path);
  return response.json();
}

async function sendLocation(location) {
  if (!state.roomId) return;
  try {
    await postJson("/api/location", {
      roomId: state.roomId,
      id: state.clientId,
      ...location
    });
  } catch {
    setStatus("Konum gidemedi", true);
  }
}

async function sendMessage(payload) {
  if (!state.roomId) {
    setStatus("Once baslat", true);
    return;
  }

  try {
    await postJson("/api/message", {
      roomId: state.roomId,
      id: state.clientId,
      ...payload
    });
  } catch {
    setStatus("Mesaj gidemedi", true);
  }
}

function openStream() {
  if (state.eventSource) state.eventSource.close();

  state.eventSource = new EventSource(`/api/stream?room=${encodeURIComponent(state.roomId)}`);
  state.eventSource.onopen = () => setStatus("Canli");
  state.eventSource.onerror = () => setStatus("Baglanti bekliyor", true);
  state.eventSource.onmessage = (event) => {
    try {
      renderRoom(JSON.parse(event.data));
    } catch {
      setStatus("Veri okunamadi", true);
    }
  };
}

async function joinRoom() {
  state.roomId = els.room.value.trim().toUpperCase();
  state.name = els.name.value.trim() || "Arac";
  if (!state.roomId) {
    setStatus("Oda yaz", true);
    return;
  }

  localStorage.setItem("roadTrackerRoom", state.roomId);
  localStorage.setItem("roadTrackerName", state.name);

  setStatus("Baglaniyor");
  try {
    await postJson("/api/join", {
      roomId: state.roomId,
      id: state.clientId,
      name: state.name,
      color: state.color
    });
    openStream();
    startGeolocation();
  } catch {
    setStatus("Sunucu yok", true);
  }
}

async function startRecording() {
  if (!state.roomId) {
    setStatus("Once baslat", true);
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    setStatus("Mikrofon yok", true);
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.audioChunks = [];
    state.recordingStartedAt = Date.now();
    state.mediaRecorder = new MediaRecorder(stream);

    state.mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) state.audioChunks.push(event.data);
    });

    state.mediaRecorder.addEventListener("stop", async () => {
      stream.getTracks().forEach((track) => track.stop());
      els.record.classList.remove("recording");
      els.record.textContent = "Ses";
      els.recordingStatus.textContent = "Gonderiliyor";

      const blob = new Blob(state.audioChunks, { type: state.mediaRecorder.mimeType || "audio/webm" });
      const duration = Math.round((Date.now() - state.recordingStartedAt) / 1000);
      if (blob.size < 800) {
        els.recordingStatus.textContent = "Hazir";
        return;
      }

      const audio = await blobToDataUrl(blob);
      await sendMessage({ type: "audio", audio, duration });
      els.recordingStatus.textContent = "Hazir";
    });

    state.mediaRecorder.start();
    els.record.classList.add("recording");
    els.record.textContent = "Bitir";
    els.recordingStatus.textContent = "Kayit";
  } catch {
    setStatus("Mikrofon izni gerekli", true);
  }
}

function isRecording() {
  return state.mediaRecorder?.state === "recording";
}

function stopRecording() {
  if (isRecording()) {
    state.mediaRecorder.stop();
  }
}

function toggleRecording(event) {
  event.preventDefault();
  els.messageInput.blur();

  if (isRecording()) {
    stopRecording();
    return;
  }

  startRecording();
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

window.addEventListener("pagehide", () => {
  if (!state.roomId) return;
  navigator.sendBeacon?.(
    "/api/leave",
    new Blob([JSON.stringify({ roomId: state.roomId, id: state.clientId })], {
      type: "application/json"
    })
  );
});

els.join.addEventListener("click", joinRoom);
els.install.addEventListener("click", installApp);
els.navigate.addEventListener("click", openNavigation);
els.messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = els.messageInput.value.trim();
  if (!text) return;

  els.messageInput.value = "";
  await sendMessage({ type: "text", text });
});
els.record.addEventListener("click", toggleRecording);
els.record.addEventListener("contextmenu", (event) => event.preventDefault());
els.center.addEventListener("click", () => {
  state.followMe = true;
  if (state.myLocation) map.setView([state.myLocation.lat, state.myLocation.lng], 16);
});
map.on("dragstart", () => {
  state.followMe = false;
});

setInterval(() => renderMembers(state.members), 5000);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js").catch(() => {});
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  updateInstallUi();
});

window.addEventListener("appinstalled", () => {
  installPrompt = null;
  updateInstallUi();
});

updateInstallUi();
