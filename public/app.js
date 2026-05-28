const state = {
  clientId: localStorage.getItem("roadTrackerClientId") || crypto.randomUUID(),
  eventSource: null,
  watchId: null,
  roomId: "",
  name: "",
  color: localStorage.getItem("roadTrackerColor") || randomColor(),
  myLocation: null,
  members: [],
  followMe: true
};

const els = {
  room: document.querySelector("#roomInput"),
  name: document.querySelector("#nameInput"),
  join: document.querySelector("#joinButton"),
  center: document.querySelector("#centerButton"),
  status: document.querySelector("#connectionStatus"),
  peerName: document.querySelector("#peerName"),
  distance: document.querySelector("#distance"),
  freshness: document.querySelector("#freshness")
};

els.room.value = localStorage.getItem("roadTrackerRoom") || "TATIL2026";
els.name.value = localStorage.getItem("roadTrackerName") || `Arac ${Math.floor(Math.random() * 90 + 10)}`;
localStorage.setItem("roadTrackerColor", state.color);
localStorage.setItem("roadTrackerClientId", state.clientId);

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

function openStream() {
  if (state.eventSource) state.eventSource.close();

  state.eventSource = new EventSource(`/api/stream?room=${encodeURIComponent(state.roomId)}`);
  state.eventSource.onopen = () => setStatus("Canli");
  state.eventSource.onerror = () => setStatus("Baglanti bekliyor", true);
  state.eventSource.onmessage = (event) => {
    try {
      renderMembers(JSON.parse(event.data));
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
