import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCWvHbZghVZu9aDUO-sHroxOiN0WXZ3AgI",
  authDomain: "cricketauction-df77b.firebaseapp.com",
  databaseURL: "https://cricketauction-df77b-default-rtdb.firebaseio.com",
  projectId: "cricketauction-df77b",
  storageBucket: "cricketauction-df77b.firebasestorage.app",
  messagingSenderId: "1052181366792",
  appId: "1:1052181366792:web:c86af556248567e9f5e9bd",
  measurementId: "G-BF00NXYJJ9"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

const SETTINGS_REF = doc(db, "auction_meta", "settings");
const teamsCol = collection(db, "teams");
const playersCol = collection(db, "players");

const state = {
  settings: null,
  teams: [],
  players: [],
  currentPlayer: null,
  feed: []
};

const $ = id => document.getElementById(id);

/* ================================================================
   CLOUDINARY CONFIG
   ================================================================ */
const CLOUDINARY_CLOUD_NAME = "djs0aghiu";
const CLOUDINARY_UPLOAD_PRESET = "auction_upload";

/* ================================================================
   UPLOAD TO CLOUDINARY (FAST)
   ================================================================ */

async function uploadImage(file, folder, options = {}) {
  if (!file) return "";

  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    formData.append("folder", `auction/${folder}`);

    // ✅ NO transformation in FormData (not allowed in unsigned uploads)

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      {
        method: "POST",
        body: formData
      }
    );

    if (!response.ok) {
      const errData = await response.json();
      console.error("Cloudinary Error Details:", errData); // Shows exact reason
      throw new Error(`Upload failed: ${errData.error?.message || response.statusText}`);
    }

    const data = await response.json();

    // ✅ Apply transformations via URL AFTER upload (this is the correct way)
    let url = data.secure_url;

    if (folder === "team_logos") {
      url = url.replace("/upload/", "/upload/w_200,h_200,c_fill,f_auto,q_auto/");
    } else if (folder === "player_photos") {
      url = url.replace("/upload/", "/upload/w_400,h_400,c_fill,f_auto,q_auto/");
    }

    return url;

  } catch (err) {
    console.error("Cloudinary upload failed:", err);
    alert("Image upload failed: " + err.message);
    return "";
  }
}



function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function safeName(n) {
  return n.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function optimizeImage(file, options = {}) {
  if (!file) return null;

  const {
    maxWidth = 1200,
    maxHeight = 1200,
    quality = 0.82,
    minProcessSizeKB = 250
  } = options;

  if (!file.type || !file.type.startsWith("image/")) return file;
    if (file.size <= minProcessSizeKB * 1024) return file;

  try {
    const objectUrl = URL.createObjectURL(file);

    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = objectUrl;
    });

    const scale = Math.min(1, maxWidth / img.width, maxHeight / img.height);

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));

    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise(resolve => {
      canvas.toBlob(resolve, "image/webp", quality);
    });

    URL.revokeObjectURL(objectUrl);

    if (!blob) return file;
    if (blob.size >= file.size) return file;

    const newName = file.name.replace(/\.[^.]+$/, "") + ".webp";
    return new File([blob], newName, { type: "image/webp" });
  } catch (err) {
    console.warn("Image optimization skipped:", err);
    return file;
  }
}



function previewFile(input, imgEl) {
  const file = input.files[0];
  if (!file) {
    imgEl.src = "";
    imgEl.classList.remove("show");
    return;
  }
  imgEl.src = URL.createObjectURL(file);
  imgEl.classList.add("show");
}

async function clearCol(colName) {
  const snap = await getDocs(collection(db, colName));
  await Promise.all(snap.docs.map(d => deleteDoc(doc(db, colName, d.id))));
}

function placeholderImg(text = "?") {
  return `https://placehold.co/40x40/0f172a/ffffff?text=${encodeURIComponent(text)}`;
}

async function loadSettings() {
  const snap = await getDoc(SETTINGS_REF);
  state.settings = snap.exists() ? snap.data() : null;
}

async function loadTeams() {
  const snap = await getDocs(teamsCol);
  state.teams = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function loadPlayers() {
  const snap = await getDocs(playersCol);
  state.players = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function reloadAuctionData() {
  await loadSettings();
  await loadTeams();
  await loadPlayers();
  renderAuctionScreen();
  pushFeed("🔄 Data reloaded");
}

function getTeamStats(team) {
  const s = state.settings;
  if (!s) return { bought: [], spent: 0, purseLeft: 0, slotsFilled: 0, slotsLeft: 0, maxBid: 0 };

  const bought = state.players.filter(p => p.status === "Sold" && p.soldToTeamId === team.id);
  const spent = bought.reduce((sum, p) => sum + Number(p.soldPrice || 0), 0);
  const purseLeft = Number(s.teamPurse) - spent;
  const slotsFilled = bought.length;
  const slotsLeft = Number(s.playersPerTeam) - slotsFilled;
  const reserveNeeded = Math.max(0, slotsLeft - 1) * Number(s.basePrice);
  const maxBid = Math.max(0, purseLeft - reserveNeeded);

  return { bought, spent, purseLeft, slotsFilled, slotsLeft, maxBid };
}

function allTeamsFull() {
  if (!state.teams.length || !state.settings) return false;
  return state.teams.every(t => getTeamStats(t).slotsLeft <= 0);
}

function getPendingPlayers() {
  return state.players
    .filter(p => p.status === "Pending")
    .sort((a, b) => Number(a.auctionOrder || 0) - Number(b.auctionOrder || 0));
}

function getUnsoldPlayers() {
  return state.players.filter(p => p.status === "Unsold");
}

function getNextPendingPlayer() {
  const list = getPendingPlayers();
  return list.length ? list[0] : null;
}

function getEligibleTeams() {
  return state.teams
    .map(t => ({ ...t, stats: getTeamStats(t) }))
    .filter(t => t.stats.slotsLeft > 0 && t.stats.maxBid >= Number(state.settings.basePrice));
}

function pushFeed(text) {
  state.feed.unshift(text);
  if (state.feed.length > 60) state.feed = state.feed.slice(0, 60);
  renderFeed();
}

function renderFeed() {
  const list = $("feedList");
  if (!state.feed.length) {
    list.innerHTML = `<li class="muted-li">No activity yet.</li>`;
    $("feedCountBadge").textContent = "0";
    return;
  }
  list.innerHTML = state.feed.map(t => `<li>${t}</li>`).join("");
  $("feedCountBadge").textContent = state.feed.length;
}

function goToScreen(num) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $(`screen${num}`).classList.add("active");
  document.querySelectorAll(".step").forEach(s => {
    s.classList.remove("active", "done");
    const n = Number(s.dataset.step);
    if (n < num) s.classList.add("done");
    if (n === num) s.classList.add("active");
  });
}

function renderTeamProgress() {
  const total = Number(state.settings?.numTeams || 0);
  const current = document.querySelectorAll(".team-entry-card").length;
  $("teamProgress").textContent = `${current} / ${total} added`;
}

function createTeamFormCard(index) {
  const div = document.createElement("div");
  div.className = "entry-card team-entry-card";
  div.innerHTML = `
    <div class="entry-top">
      <strong>Team ${index}</strong>
      <button class="btn btn-danger btn-sm" data-remove-team>🗑 Remove</button>
    </div>
    <div class="form-grid">
      <div class="form-group">
        <label>Team Name</label>
        <input type="text" class="input t-name" placeholder="e.g. Mumbai Indians">
      </div>
      <div class="form-group">
        <label>Team Logo</label>
        <input type="file" class="t-logo" accept="image/*">
        <img class="preview t-preview" alt="preview">
      </div>
    </div>
  `;
  const fileInput = div.querySelector(".t-logo");
  const imgPrev = div.querySelector(".t-preview");
  fileInput.addEventListener("change", () => previewFile(fileInput, imgPrev));
  div.querySelector("[data-remove-team]").addEventListener("click", () => {
    div.remove();
    refreshTeamNumbers();
    renderTeamProgress();
  });
  return div;
}

function refreshTeamNumbers() {
  document.querySelectorAll(".team-entry-card").forEach((el, i) => {
    const strong = el.querySelector("strong");
    if (strong) strong.textContent = `Team ${i + 1}`;
  });
}

function addTeamForm() {
  const total = Number(state.settings?.numTeams || 0);
  const container = $("teamFormsContainer");
  if (container.children.length >= total) {
    return alert(`You can only add ${total} teams.`);
  }
  container.appendChild(createTeamFormCard(container.children.length + 1));
  renderTeamProgress();
}

function renderPlayerProgress() {
  const total = Number(state.settings?.numPlayers || 0);
  const current = document.querySelectorAll(".player-entry-card").length;
  $("playerProgress").textContent = `${current} / ${total} added`;
}

function createPlayerFormCard(index) {
  const div = document.createElement("div");
  div.className = "entry-card player-entry-card";
  div.innerHTML = `
    <div class="entry-top">
      <strong>Player ${index}</strong>
      <button class="btn btn-danger btn-sm" data-remove-player>🗑 Remove</button>
    </div>
    <div class="form-grid">
      <div class="form-group">
        <label>Player Name</label>
        <input type="text" class="input p-name" placeholder="e.g. Virat Kohli">
      </div>
      <div class="form-group">
        <label>Player Photo</label>
        <input type="file" class="p-photo" accept="image/*">
        <img class="preview p-preview" alt="preview">
      </div>
      <div class="form-group">
        <label>Batting Hand</label>
        <select class="select p-batting">
          <option value="">Select</option>
          <option>Right-Handed</option>
          <option>Left-Handed</option>
        </select>
      </div>
      <div class="form-group">
        <label>Bowling Style</label>
        <select class="select p-bowling">
          <option value="">Select</option>
          <option>Right-Arm Fast</option>
          <option>Right-Arm Medium</option>
          <option>Right-Arm Spin</option>
          <option>Left-Arm Fast</option>
          <option>Left-Arm Medium</option>
          <option>Left-Arm Spin</option>
          <option>None</option>
        </select>
      </div>
      <div class="form-group">
        <label>Player Role</label>
        <select class="select p-role">
          <option value="">Select</option>
          <option>Batsman</option>
          <option>Bowler</option>
          <option>All-Rounder</option>
          <option>Wicket-Keeper</option>
        </select>
      </div>
    </div>
  `;
  const fileInput = div.querySelector(".p-photo");
  const imgPrev = div.querySelector(".p-preview");
  fileInput.addEventListener("change", () => previewFile(fileInput, imgPrev));
  div.querySelector("[data-remove-player]").addEventListener("click", () => {
    div.remove();
    refreshPlayerNumbers();
    renderPlayerProgress();
  });
  return div;
}

function refreshPlayerNumbers() {
  document.querySelectorAll(".player-entry-card").forEach((el, i) => {
    const strong = el.querySelector("strong");
    if (strong) strong.textContent = `Player ${i + 1}`;
  });
}

function addPlayerForm() {
  const total = Number(state.settings?.numPlayers || 0);
  const container = $("playerFormsContainer");
  if (container.children.length >= total) {
    return alert(`You can only add ${total} players.`);
  }
  container.appendChild(createPlayerFormCard(container.children.length + 1));
  renderPlayerProgress();
}

async function saveSetup() {
  const tournamentName = $("setupTournament").value.trim() || "My Tournament";
  const numTeams = Number($("setupTeams").value);
  const playersPerTeam = Number($("setupPerTeam").value);
  const numPlayers = Number($("setupPlayers").value);
  const basePrice = Number($("setupBasePrice").value);
  const teamPurse = Number($("setupPurse").value);

  if (!numTeams || !playersPerTeam || !numPlayers || !basePrice || !teamPurse) {
    return alert("Please fill all setup fields.");
  }
  if (numPlayers < numTeams * playersPerTeam) {
    return alert(`Total players must be at least ${numTeams * playersPerTeam}.`);
  }

  try {
    await clearCol("teams");
    await clearCol("players");

    const settings = {
      tournamentName,
      numTeams,
      playersPerTeam,
      numPlayers,
      basePrice,
      teamPurse,
      stage: "teams",
      currentRound: 1,
      auctionEnded: false,
      livePlayerId: "",
      createdAt: Date.now()
    };

    await setDoc(SETTINGS_REF, settings);
    state.settings = settings;
    state.teams = [];
    state.players = [];
    state.currentPlayer = null;
    state.feed = [];

    $("headerTournament").textContent = `Tournament: ${tournamentName}`;

    $("teamFormsContainer").innerHTML = "";
    $("playerFormsContainer").innerHTML = "";
    addTeamForm();
    renderTeamProgress();
    goToScreen(2);

    $("liveBadge").textContent = "● LIVE";
    $("liveBadge").classList.add("online");

    pushFeed(`⚙️ ${tournamentName} setup saved`);
  } catch (e) {
    console.error(e);
    alert("Setup failed: " + e.message);
  }
}

async function saveAllTeams() {
  const cards = [...document.querySelectorAll(".team-entry-card")];
  const expected = Number(state.settings.numTeams);

  if (cards.length !== expected) {
    return alert(`Please add exactly ${expected} teams. You have ${cards.length}.`);
  }

  try {
    await clearCol("teams");

    for (const card of cards) {
      const name = card.querySelector(".t-name").value.trim();
      const file = card.querySelector(".t-logo").files[0];
      if (!name) return alert("Please fill all team names.");

      const logoUrl = await uploadImage(file, "team_logos");


      await addDoc(teamsCol, {
        name,
        logoUrl,
        purse: Number(state.settings.teamPurse),
        createdAt: Date.now()
      });
    }

    await updateDoc(SETTINGS_REF, { stage: "players" });
    await loadTeams();

    $("basePriceLabel").textContent = state.settings.basePrice;
    $("playerFormsContainer").innerHTML = "";
    addPlayerForm();
    renderPlayerProgress();
    goToScreen(3);
    pushFeed(`✅ ${cards.length} teams saved`);
  } catch (e) {
    console.error(e);
    alert("Saving teams failed: " + e.message);
  }
}

async function saveAllPlayers() {
  const cards = [...document.querySelectorAll(".player-entry-card")];
  const expected = Number(state.settings.numPlayers);

  if (cards.length !== expected) {
    return alert(`Please add exactly ${expected} players. You have ${cards.length}.`);
  }

  try {
    await clearCol("players");

    const payloads = [];

    for (const card of cards) {
      const name = card.querySelector(".p-name").value.trim();
      const batting = card.querySelector(".p-batting").value;
      const bowling = card.querySelector(".p-bowling").value;
      const role = card.querySelector(".p-role").value;
      const file = card.querySelector(".p-photo").files[0];

      if (!name || !batting || !bowling || !role) {
        return alert("Please fill all details for every player.");
      }

     const imageUrl = await uploadImage(file, "player_photos");

      payloads.push({
        name,
        batting,
        bowling,
        role,
        imageUrl,
        basePrice: Number(state.settings.basePrice),
        status: "Pending",
        soldToTeamId: "",
        soldToTeamName: "",
        soldPrice: 0,
        auctionRound: 1,
        reauctionCount: 0,
        createdAt: Date.now()
      });
    }

    const shuffled = shuffleArray(payloads);

    for (let i = 0; i < shuffled.length; i++) {
      await addDoc(playersCol, { ...shuffled[i], auctionOrder: i + 1 });
    }

    await updateDoc(SETTINGS_REF, { stage: "auction", auctionEnded: false });
    await loadPlayers();

    goToScreen(4);
    renderAuctionScreen();
    pushFeed(`✅ ${shuffled.length} players shuffled and saved`);
  } catch (e) {
    console.error(e);
    alert("Saving players failed: " + e.message);
  }
}

function renderTeamsDashboard() {
  const wrap = $("teamsDashboard");
  $("teamCountBadge").textContent = `${state.teams.length} teams`;

  if (!state.teams.length) {
    wrap.innerHTML = `<p class="desc">No teams found.</p>`;
    return;
  }

  wrap.innerHTML = state.teams.map(team => {
    const stats = getTeamStats(team);
    const logoEl = team.logoUrl
      ? `<img class="team-logo-sm" src="${team.logoUrl}" alt="${team.name}">`
      : `<img class="team-logo-sm" src="${placeholderImg(team.name[0])}" alt="${team.name}">`;

    const playersHtml = stats.bought.length
      ? stats.bought.map(p => `
          <div class="mini-player">
            <img src="${p.imageUrl || placeholderImg("P")}" alt="${p.name}">
            <span>${p.name}</span>
            <span style="margin-left:auto;color:#fbbf24;">${p.soldPrice}</span>
          </div>
        `).join("")
      : `<p style="font-size:12px;color:#6b7280;">No players yet</p>`;

    return `
      <div class="team-card-auction">
        <div class="team-head">
          ${logoEl}
          <div class="team-title">${team.name}</div>
        </div>
        <div class="team-metrics">
          <div class="tm green"><div class="v">${stats.purseLeft}</div><div class="l">Purse Left</div></div>
          <div class="tm yellow"><div class="v">${stats.maxBid}</div><div class="l">Max Bid</div></div>
          <div class="tm blue"><div class="v">${stats.slotsFilled}</div><div class="l">Bought</div></div>
          <div class="tm ${stats.slotsLeft === 0 ? "red" : ""}"><div class="v">${stats.slotsLeft}</div><div class="l">Slots Left</div></div>
        </div>
        <div class="team-players-mini">${playersHtml}</div>
      </div>
    `;
  }).join("");
}

function renderSummary() {
  const s = state.settings;
  if (!s) return;

  $("sTeams").textContent = s.numTeams || 0;
  $("sPlayers").textContent = s.numPlayers || 0;
  $("sPerTeam").textContent = s.playersPerTeam || 0;
  $("sBase").textContent = s.basePrice || 0;
  $("sPurse").textContent = s.teamPurse || 0;
  $("sRound").textContent = s.currentRound || 1;

  if ($("headerTournament")) {
    $("headerTournament").textContent = `Tournament: ${s.tournamentName || "My Tournament"}`;
  }

  document.title = `${s.tournamentName || "My Tournament"} - Auction System`;
}

function renderPlayersTable() {
  const tbody = $("playersTableBody");
  $("playerTableBadge").textContent = state.players.length;

  if (!state.players.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="desc" style="text-align:center;">No players found.</td></tr>`;
    return;
  }

  const sorted = [...state.players].sort((a, b) => Number(a.auctionOrder || 0) - Number(b.auctionOrder || 0));

  tbody.innerHTML = sorted.map(p => {
    const statusClass = p.status === "Sold" ? "chip-sold" : p.status === "Unsold" ? "chip-unsold" : "chip-pending";

    const playerThumb = p.imageUrl
      ? `<img class="thumb-sm" src="${p.imageUrl}" alt="${p.name}">`
      : `<img class="thumb-sm" src="${placeholderImg(p.name[0])}" alt="${p.name}">`;

    const teamLogo = p.soldToTeamId
      ? (() => {
          const team = state.teams.find(t => t.id === p.soldToTeamId);
          return team?.logoUrl
            ? `<img class="thumb-sm" src="${team.logoUrl}" alt="${team.name}">`
            : `<img class="thumb-sm" src="${placeholderImg(p.soldToTeamName?.[0] || "T")}" alt="">`;
        })()
      : `<span style="color:#6b7280;">—</span>`;

    const roundLabel = `${p.auctionRound || 1}${Number(p.reauctionCount || 0) > 0 ? " ♻" : ""}`;

    return `
      <tr>
        <td>${playerThumb}</td>
        <td>${p.name}</td>
        <td>${p.batting || "—"}</td>
        <td>${p.bowling || "—"}</td>
        <td>${teamLogo}</td>
        <td>${p.soldToTeamName || "—"}</td>
        <td>${p.soldPrice || "—"}</td>
        <td class="${statusClass}">${p.status}</td>
        <td>${roundLabel}</td>
      </tr>
    `;
  }).join("");
}

function renderCurrentPlayer() {
  const wrap = $("currentPlayerArea");
  const player = state.currentPlayer;

  if (!player) {
    const pending = getPendingPlayers().length;
    const unsold = getUnsoldPlayers().length;
    wrap.innerHTML = `
      <div class="player-placeholder">👤</div>
      <h3 class="player-big-name">No Player Loaded</h3>
      <p class="desc">Click ▶️ Next Player to begin</p>
      <p class="desc">Pending: ${pending} | Unsold: ${unsold}</p>
    `;
    $("currentBadge").textContent = "Awaiting";
    return;
  }

  const eligible = getEligibleTeams();
  const teamOpts = eligible.length
    ? eligible.map(t => `<option value="${t.id}">${t.name} | Purse: ${t.stats.purseLeft} | Max: ${t.stats.maxBid}</option>`).join("")
    : `<option value="">No eligible teams</option>`;

  const imgEl = player.imageUrl
    ? `<img class="player-big-img" src="${player.imageUrl}" alt="${player.name}">`
    : `<div class="player-placeholder">👤</div>`;

  const basePrice = Number(state.settings.basePrice);
  const increments = [basePrice, basePrice * 2, basePrice * 5, basePrice * 10];

  wrap.innerHTML = `
    ${imgEl}
    <div class="base-badge">Base Price: ${basePrice}</div>
    <h3 class="player-big-name">${player.name}</h3>
    <div class="tag-row">
      <span class="player-tag">🏏 ${player.batting}</span>
      <span class="player-tag">🎯 ${player.bowling}</span>
      <span class="player-tag">⭐ ${player.role}</span>
      <span class="player-tag">Round ${player.auctionRound || 1}${Number(player.reauctionCount || 0) > 0 ? " ♻" : ""}</span>
    </div>

    <div class="bid-panel">
      <div class="form-grid">
        <div class="form-group">
          <label>Select Bidding Team</label>
          <select class="select" id="bidTeamSelect">
            <option value="">— Choose Team —</option>
            ${teamOpts}
          </select>
        </div>
        <div class="form-group">
          <label>Bid Amount</label>
          <input type="number" class="input" id="bidAmountInput" min="${basePrice}" value="${basePrice}" step="1">
        </div>
      </div>

      <div style="margin-top:10px;">
        <label>Quick Bid Increment</label>
        <div class="increment-row">
          ${increments.map(inc => `<button class="inc-btn" onclick="addToBid(${inc})">+${inc}</button>`).join("")}
          <button class="inc-btn" onclick="resetBid()">Reset</button>
        </div>
      </div>
    </div>

    <div class="btn-row" style="justify-content:center;">
      <button class="btn btn-success" onclick="sellCurrentPlayer()">✅ Confirm Sold</button>
      <button class="btn btn-danger" onclick="markUnsold()">❌ Mark Unsold</button>
      <button class="btn btn-secondary" onclick="startAuction()">⏭ Skip / Next</button>
    </div>
  `;

  $("currentBadge").textContent = player.reauctionCount > 0 ? "♻ Re-Auction" : "🟢 Live";
}

function addToBid(amount) {
  const input = $("bidAmountInput");
  if (!input) return;
  input.value = Number(input.value || 0) + amount;
}

function resetBid() {
  const input = $("bidAmountInput");
  if (!input || !state.settings) return;
  input.value = state.settings.basePrice;
}

async function startAuction() {
  await loadSettings();
  await loadTeams();
  await loadPlayers();

  if (allTeamsFull()) {
    state.currentPlayer = null;
    await updateDoc(SETTINGS_REF, {
      auctionEnded: true,
      livePlayerId: ""
    });
    await loadSettings();
    renderAuctionScreen();
    pushFeed("🏁 All teams full — auction complete");
    return;
  }

  const next = getNextPendingPlayer();
  if (!next) {
    state.currentPlayer = null;
    await updateDoc(SETTINGS_REF, {
      livePlayerId: ""
    });
    await loadSettings();
    renderAuctionScreen();
    pushFeed("⚠️ No more pending players. Use Re-Auction for unsold.");
    return;
  }

  state.currentPlayer = next;

  await updateDoc(SETTINGS_REF, {
    livePlayerId: next.id,
    auctionEnded: false
  });

  await loadSettings();
  renderCurrentPlayer();
  pushFeed(`🎯 Loaded: ${next.name}`);
}

async function sellCurrentPlayer() {
  const player = state.currentPlayer;
  if (!player) return alert("No active player.");

  const teamId = $("bidTeamSelect")?.value;
  const bidAmt = Number($("bidAmountInput")?.value || 0);
  const baseP = Number(state.settings.basePrice);

  if (!teamId) return alert("Please select a team.");
  if (!bidAmt) return alert("Please enter a bid amount.");
  if (bidAmt < baseP) return alert(`Bid must be at least ${baseP}.`);

  const team = state.teams.find(t => t.id === teamId);
  if (!team) return alert("Invalid team selected.");

  const stats = getTeamStats(team);
  if (stats.slotsLeft <= 0) return alert(`${team.name} has reached player limit.`);
  if (bidAmt > stats.maxBid) return alert(`${team.name} can bid max ${stats.maxBid} to keep enough for remaining slots.`);

  try {
    await updateDoc(doc(db, "players", player.id), {
      status: "Sold",
      soldToTeamId: team.id,
      soldToTeamName: team.name,
      soldPrice: bidAmt
    });

    await updateDoc(SETTINGS_REF, {
      livePlayerId: ""
    });

    pushFeed(`✅ ${player.name} → ${team.name} for ${bidAmt}`);
    state.currentPlayer = null;
    await loadPlayers();

    if (allTeamsFull()) {
      await updateDoc(SETTINGS_REF, { auctionEnded: true });
      pushFeed("🏁 All teams full — auction ended automatically");
    }

    renderAuctionScreen();
  } catch (e) {
    console.error(e);
    alert("Sell failed: " + e.message);
  }
}

async function markUnsold() {
  const player = state.currentPlayer;
  if (!player) return alert("No active player.");

  try {
    await updateDoc(doc(db, "players", player.id), {
      status: "Unsold",
      soldToTeamId: "",
      soldToTeamName: "",
      soldPrice: 0
    });

    await updateDoc(SETTINGS_REF, {
      livePlayerId: ""
    });

    pushFeed(`❌ ${player.name} → Unsold`);
    state.currentPlayer = null;
    await loadPlayers();
    renderAuctionScreen();
  } catch (e) {
    console.error(e);
    alert("Mark unsold failed: " + e.message);
  }
}

async function reauctionUnsold() {
  await loadSettings();
  await loadPlayers();

  const unsold = getUnsoldPlayers();
  if (!unsold.length) return alert("No unsold players to re-auction.");

  const shuffled = shuffleArray(unsold);
  const maxOrder = Math.max(0, ...state.players.map(p => Number(p.auctionOrder || 0)));
  const newRound = Number(state.settings.currentRound || 1) + 1;

  try {
    for (let i = 0; i < shuffled.length; i++) {
      await updateDoc(doc(db, "players", shuffled[i].id), {
        status: "Pending",
        soldToTeamId: "",
        soldToTeamName: "",
        soldPrice: 0,
        auctionRound: newRound,
        reauctionCount: Number(shuffled[i].reauctionCount || 0) + 1,
        auctionOrder: maxOrder + i + 1
      });
    }

    await updateDoc(SETTINGS_REF, {
      currentRound: newRound,
      auctionEnded: false,
      livePlayerId: ""
    });

    pushFeed(`♻️ Re-auction started for ${unsold.length} unsold players (Round ${newRound})`);
    await loadSettings();
    await loadPlayers();
    state.currentPlayer = null;
    renderAuctionScreen();
  } catch (e) {
    console.error(e);
    alert("Re-auction failed: " + e.message);
  }
}

function exportCSV() {
  if (!state.players.length) return alert("No player data to export.");

  const rows = [
    ["#", "Name", "Batting", "Bowling", "Role", "Status", "Team", "Bid Amount", "Round"]
  ];

  const sorted = [...state.players].sort((a, b) => Number(a.auctionOrder || 0) - Number(b.auctionOrder || 0));

  sorted.forEach((p, i) => {
    rows.push([
      i + 1,
      p.name,
      p.batting || "",
      p.bowling || "",
      p.role || "",
      p.status || "Pending",
      p.soldToTeamName || "",
      p.soldPrice || 0,
      p.auctionRound || 1
    ]);
  });

  rows.push([]);
  rows.push(["Team", "Purse Left", "Spent", "Players Bought", "Slots Left", "Max Bid"]);

  state.teams.forEach(team => {
    const s = getTeamStats(team);
    rows.push([team.name, s.purseLeft, s.spent, s.slotsFilled, s.slotsLeft, s.maxBid]);
  });

  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `auction_result_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  pushFeed("📥 CSV exported");
}

function renderAuctionScreen() {
  renderSummary();
  renderTeamsDashboard();
  renderPlayersTable();
  renderCurrentPlayer();
  renderFeed();

  if (allTeamsFull()) {
    $("endBanner").style.display = "block";
  } else {
    $("endBanner").style.display = "none";
  }
}

async function boot() {
  try {
    await loadSettings();

    if (state.settings) {
      if ($("setupTournament")) $("setupTournament").value = state.settings.tournamentName || "My Tournament";
      if ($("setupTeams")) $("setupTeams").value = state.settings.numTeams || 4;
      if ($("setupPerTeam")) $("setupPerTeam").value = state.settings.playersPerTeam || 5;
      if ($("setupPlayers")) $("setupPlayers").value = state.settings.numPlayers || 20;
      if ($("setupBasePrice")) $("setupBasePrice").value = state.settings.basePrice || 100;
      if ($("setupPurse")) $("setupPurse").value = state.settings.teamPurse || 1000;
    }

    $("liveBadge").textContent = "● LIVE";
    $("liveBadge").classList.add("online");

    if (!state.settings) {
      goToScreen(1);
      return;
    }

    if (state.settings.stage === "teams") {
      $("teamFormsContainer").innerHTML = "";
      addTeamForm();
      renderTeamProgress();
      goToScreen(2);
      return;
    }

    if (state.settings.stage === "players") {
      await loadTeams();
      $("basePriceLabel").textContent = state.settings.basePrice;
      $("playerFormsContainer").innerHTML = "";
      addPlayerForm();
      renderPlayerProgress();
      goToScreen(3);
      return;
    }

    await loadTeams();
    await loadPlayers();
    goToScreen(4);
    renderAuctionScreen();
    pushFeed("🚀 Auction loaded successfully");
  } catch (e) {
    console.error(e);
    alert("App failed to load: " + e.message);
  }
}

window.saveSetup = saveSetup;
window.goToScreen = goToScreen;
window.addTeamForm = addTeamForm;
window.saveAllTeams = saveAllTeams;
window.addPlayerForm = addPlayerForm;
window.saveAllPlayers = saveAllPlayers;
window.startAuction = startAuction;
window.sellCurrentPlayer = sellCurrentPlayer;
window.markUnsold = markUnsold;
window.reauctionUnsold = reauctionUnsold;
window.addToBid = addToBid;
window.resetBid = resetBid;
window.reloadAuctionData = reloadAuctionData;
window.exportCSV = exportCSV;

boot();