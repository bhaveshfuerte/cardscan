// BizCard Snap - Core Javascript Module

// --- State Variables ---
let cardsDB = [];
let currentStream = null;
let activeFacingMode = "environment"; // default to rear camera on mobile
let currentOcrImage = null; // Base64 data of image currently being scanned
let isProcessing = false;
let activeTab = "webcam";
let editingCardId = null; // null if creating, holds ID if editing
let activeDeviceId = null; // holds selected camera hardware ID

// --- Initialization ---
document.addEventListener("DOMContentLoaded", async () => {
  // Initialize Lucide Icons
  lucide.createIcons();
  
  // Load settings and database from local storage
  loadSettingsFromStorage();
  loadDatabaseFromStorage();
  
  // Sync with cloud if configured
  syncWithCloudDatabase();
  
  // Setup DOM Event Listeners
  setupCameraEventListeners();
  setupUploadEventListeners();
  
  // Initialize webcam on tab load if on webcam tab
  if (activeTab === "webcam") {
    startCamera();
  }
});

// --- Toast Notifications ---
function showToast(message, type = "info") {
  const toast = document.getElementById("toast");
  const toastMessage = document.getElementById("toast-message");
  const toastIcon = document.getElementById("toast-icon");
  
  toastMessage.textContent = message;
  toast.className = `toast toast-${type}`;
  
  // Set icons based on type
  if (type === "success") {
    toastIcon.setAttribute("data-lucide", "check-circle-2");
  } else if (type === "danger") {
    toastIcon.setAttribute("data-lucide", "alert-circle");
  } else {
    toastIcon.setAttribute("data-lucide", "info");
  }
  lucide.createIcons();
  
  toast.classList.remove("hidden");
  
  setTimeout(() => {
    toast.classList.add("hidden");
  }, 4000);
}

// --- Settings Management (LocalStorage) ---
function loadSettingsFromStorage() {
  const geminiKey = localStorage.getItem("bizcard_settings_gemini_key") || "";
  const imgbbKey = localStorage.getItem("bizcard_settings_imgbb_key") || "";
  const jsonbinKey = localStorage.getItem("bizcard_settings_jsonbin_key") || "";
  const jsonbinId = localStorage.getItem("bizcard_settings_jsonbin_id") || "";
  
  document.getElementById("setting-gemini-key").value = geminiKey;
  document.getElementById("setting-imgbb-key").value = imgbbKey;
  document.getElementById("setting-jsonbin-key").value = jsonbinKey;
  document.getElementById("setting-jsonbin-id").value = jsonbinId;
}

function saveSettings() {
  const geminiKey = document.getElementById("setting-gemini-key").value.trim();
  const imgbbKey = document.getElementById("setting-imgbb-key").value.trim();
  const jsonbinKey = document.getElementById("setting-jsonbin-key").value.trim();
  const jsonbinId = document.getElementById("setting-jsonbin-id").value.trim();
  
  localStorage.setItem("bizcard_settings_gemini_key", geminiKey);
  localStorage.setItem("bizcard_settings_imgbb_key", imgbbKey);
  localStorage.setItem("bizcard_settings_jsonbin_key", jsonbinKey);
  localStorage.setItem("bizcard_settings_jsonbin_id", jsonbinId);
  
  showToast("Settings saved successfully!", "success");
  closeSettingsDrawer();
  
  if (jsonbinKey && jsonbinId) {
    syncWithCloudDatabase();
  }
}

function togglePasswordVisibility(fieldId) {
  const input = document.getElementById(fieldId);
  const icon = document.getElementById(`${fieldId}-eye`);
  if (input.type === "password") {
    input.type = "text";
    icon.setAttribute("data-lucide", "eye-off");
  } else {
    input.type = "password";
    icon.setAttribute("data-lucide", "eye");
  }
  lucide.createIcons();
}

// Settings Drawer Actions
const settingsDrawer = document.getElementById("settings-panel");
document.getElementById("btn-settings-open").addEventListener("click", () => {
  settingsDrawer.classList.add("active");
});
document.getElementById("btn-settings-close-x").addEventListener("click", closeSettingsDrawer);
document.getElementById("settings-overlay").addEventListener("click", closeSettingsDrawer);

function closeSettingsDrawer() {
  settingsDrawer.classList.remove("active");
}

// --- Database Management (LocalStorage) ---
function loadDatabaseFromStorage() {
  const saved = localStorage.getItem("bizcards_db");
  if (saved) {
    try {
      cardsDB = JSON.parse(saved);
    } catch (e) {
      console.error("Failed to parse database", e);
      cardsDB = [];
    }
  }
  renderDatabase();
}

function saveDatabaseToStorage() {
  localStorage.setItem("bizcards_db", JSON.stringify(cardsDB));
  renderDatabase();
  pushDatabaseToCloud(); // push background backup to cloud
}

// --- JSONBin Cloud Sync Integration ---
async function syncWithCloudDatabase() {
  const apiKey = localStorage.getItem("bizcard_settings_jsonbin_key");
  const binId = localStorage.getItem("bizcard_settings_jsonbin_id");
  
  if (!apiKey || !binId || apiKey.trim().length === 0 || binId.trim().length === 0) return;
  
  showToast("Syncing database with cloud...", "info");
  
  try {
    const url = `https://api.jsonbin.io/v3/b/${binId.trim()}/latest`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Master-Key": apiKey.trim()
      }
    });
    
    if (!response.ok) {
      throw new Error(`Sync Read Error: Status ${response.status}`);
    }
    
    const data = await response.json();
    const remoteCards = data.record.cards || [];
    
    // Merge local and remote cards by ID
    const mergedMap = new Map();
    cardsDB.forEach(c => mergedMap.set(c.id, c));
    remoteCards.forEach(c => mergedMap.set(c.id, c));
    
    cardsDB = Array.from(mergedMap.values());
    localStorage.setItem("bizcards_db", JSON.stringify(cardsDB));
    renderDatabase();
    
    showToast("Database synced with cloud!", "success");
    
    // Push back merged state to cloud
    await pushDatabaseToCloud();
  } catch (err) {
    console.error("Cloud database load failed:", err);
    showToast("Cloud sync failed. Operating in offline mode.", "warning");
  }
}

async function pushDatabaseToCloud() {
  const apiKey = localStorage.getItem("bizcard_settings_jsonbin_key");
  const binId = localStorage.getItem("bizcard_settings_jsonbin_id");
  
  if (!apiKey || !binId || apiKey.trim().length === 0 || binId.trim().length === 0) return;
  
  try {
    const url = `https://api.jsonbin.io/v3/b/${binId.trim()}`;
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": apiKey.trim()
      },
      body: JSON.stringify({ cards: cardsDB })
    });
    
    if (!response.ok) {
      throw new Error(`Sync Push Error: Status ${response.status}`);
    }
  } catch (err) {
    console.error("Cloud database save failed:", err);
    showToast("Failed to backup changes to cloud database.", "warning");
  }
}

function renderDatabase() {
  const tbody = document.getElementById("cards-tbody");
  const emptyState = document.getElementById("db-empty-state");
  const listContainer = document.getElementById("cards-list-container");
  const exportControls = document.getElementById("export-controls");
  const statsCount = document.getElementById("stats-count");
  
  statsCount.textContent = cardsDB.length;
  
  if (cardsDB.length === 0) {
    emptyState.classList.remove("hidden");
    listContainer.classList.add("hidden");
    exportControls.classList.add("hidden");
    return;
  }
  
  emptyState.classList.add("hidden");
  listContainer.classList.remove("hidden");
  exportControls.classList.remove("hidden");
  
  tbody.innerHTML = "";
  cardsDB.forEach((card, idx) => {
    const tr = document.createElement("tr");
    tr.id = `row-${card.id}`;
    
    // Check if item is selected (default selected is true)
    if (card.selected === undefined) card.selected = true;
    
    tr.className = card.selected ? "selected" : "";
    
    tr.innerHTML = `
      <td>
        <input type="checkbox" class="chk-card" data-id="${card.id}" ${card.selected ? "checked" : ""} onchange="handleSelectRow('${card.id}', this.checked)">
      </td>
      <td>
        <img src="${card.image || 'placeholder.jpg'}" class="db-card-thumbnail" alt="Card Thumb" onclick="previewImageFullscreen('${card.image}')" title="Click to view full image">
      </td>
      <td>
        <span class="contact-name">${escapeHTML(card.name)}</span>
        <span class="contact-title">${escapeHTML(card.dept || 'N/A')}</span>
      </td>
      <td>
        <span class="company-name">${escapeHTML(card.company || 'N/A')}</span>
      </td>
      <td>
        <div class="contact-details">
          ${card.email ? `<span><i data-lucide="mail" size="12"></i> ${escapeHTML(card.email)}</span>` : ""}
          ${card.mobile ? `<span><i data-lucide="smartphone" size="12"></i> ${escapeHTML(card.mobile)}</span>` : ""}
          ${card.work ? `<span><i data-lucide="phone" size="12"></i> ${escapeHTML(card.work)}</span>` : ""}
          ${card.linkedin ? `<span><i data-lucide="linkedin" size="12"></i> ${escapeHTML(card.linkedin)}</span>` : ""}
        </div>
      </td>
      <td>
        <div class="row-actions">
          <button class="action-btn" onclick="editCard('${card.id}')" title="Edit Fields">
            <i data-lucide="pencil" size="14"></i>
          </button>
          <button class="action-btn btn-delete-item" onclick="deleteCard('${card.id}')" title="Delete Card">
            <i data-lucide="trash-2" size="14"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
  
  updateSelectedBadge();
  lucide.createIcons();
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

function handleSelectRow(id, isChecked) {
  const card = cardsDB.find(c => c.id === id);
  if (card) {
    card.selected = isChecked;
    const tr = document.getElementById(`row-${id}`);
    if (isChecked) {
      tr.classList.add("selected");
    } else {
      tr.classList.remove("selected");
    }
    updateSelectedBadge();
    
    // Update select all checkbox state
    const allChecked = cardsDB.every(c => c.selected);
    document.getElementById("chk-select-all").checked = allChecked;
  }
}

function toggleSelectAll(masterChk) {
  const checked = masterChk.checked;
  cardsDB.forEach(card => {
    card.selected = checked;
  });
  saveDatabaseToStorage();
}

function updateSelectedBadge() {
  const selectedCount = cardsDB.filter(c => c.selected).length;
  const badge = document.getElementById("selected-badge");
  if (selectedCount > 0) {
    badge.textContent = `${selectedCount} Selected`;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

// Sandbox demo items
function loadMockDemoData() {
  const mockCards = [
    {
      id: "mock-1",
      name: "Sophia Martinez",
      company: "Apex Global Solutions",
      dept: "Business Development",
      mobile: "+1 (555) 489-0128",
      work: "+1 (555) 489-0100",
      email: "sophia.martinez@apexglobal.com",
      website: "https://www.apexglobal.com",
      linkedin: "https://linkedin.com/in/sophiamartinez",
      address: "800 Executive Way, Suite 1200, Seattle, WA 98101",
      notes: "Met at TechExpo 2026. Follow up about cloud infrastructure.",
      selected: true,
      image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='350' height='200' viewBox='0 0 350 200'><rect width='100%' height='100%' fill='%231f2937'/><text x='20' y='50' fill='%23ffffff' font-family='sans-serif' font-size='22' font-weight='bold'>Sophia Martinez</text><text x='20' y='75' fill='%2338bdf8' font-family='sans-serif' font-size='14'>Business Development</text><text x='20' y='110' fill='%239ca3af' font-family='sans-serif' font-size='12'>Apex Global Solutions</text><text x='20' y='140' fill='%239ca3af' font-family='sans-serif' font-size='11'>M: +1 (555) 489-0128 | W: +1 (555) 489-0100</text><text x='20' y='160' fill='%2338bdf8' font-family='sans-serif' font-size='11'>E: sophia.martinez@apexglobal.com</text><rect x='280' y='20' width='50' height='50' fill='%2338bdf8' rx='5'/></svg>"
    },
    {
      id: "mock-2",
      name: "David Chen",
      company: "Luminary AI Corp",
      dept: "Product Management",
      mobile: "+1 (415) 890-3490",
      work: "+1 (415) 890-3400",
      email: "dchen@luminaryai.io",
      website: "https://luminaryai.io",
      linkedin: "https://linkedin.com/in/davidchen",
      address: "505 Mission Street, San Francisco, CA 94105",
      notes: "Demo partner for LLM processing engines.",
      selected: true,
      image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='350' height='200' viewBox='0 0 350 200'><rect width='100%' height='100%' fill='%23111827'/><rect width='100%' height='8' fill='%2310b981'/><text x='30' y='60' fill='%23ffffff' font-family='sans-serif' font-size='24' font-weight='bold'>David Chen</text><text x='30' y='85' fill='%2310b981' font-family='sans-serif' font-size='13'>Product Management</text><text x='30' y='120' fill='%23e5e7eb' font-family='sans-serif' font-size='16'>Luminary AI Corp</text><text x='30' y='155' fill='%239ca3af' font-family='sans-serif' font-size='11'>M: +1 (415) 890-3490 | E: dchen@luminaryai.io</text></svg>"
    }
  ];
  
  cardsDB = [...cardsDB, ...mockCards];
  saveDatabaseToStorage();
  closeSettingsDrawer();
  showToast("Sample cards loaded into database", "success");
}

function clearAllCards() {
  if (confirm("Are you sure you want to delete ALL scanned cards in the database?")) {
    cardsDB = [];
    saveDatabaseToStorage();
    showToast("Database cleared", "info");
  }
}

function deleteCard(id) {
  cardsDB = cardsDB.filter(c => c.id !== id);
  saveDatabaseToStorage();
  showToast("Card deleted", "info");
}

// Edit card trigger
function editCard(id) {
  const card = cardsDB.find(c => c.id === id);
  if (!card) return;
  
  editingCardId = id;
  
  document.getElementById("field-name").value = card.name || "";
  document.getElementById("field-company").value = card.company || "";
  document.getElementById("field-dept").value = card.dept || "";
  document.getElementById("field-email").value = card.email || "";
  document.getElementById("field-mobile").value = card.mobile || "";
  document.getElementById("field-work").value = card.work || "";
  document.getElementById("field-website").value = card.website || "";
  document.getElementById("field-linkedin").value = card.linkedin || "";
  document.getElementById("field-address").value = card.address || "";
  document.getElementById("field-notes").value = card.notes || "";
  document.getElementById("field-image-data").value = card.image || "";
  
  // Show image reference preview
  const previewContainer = document.getElementById("form-card-preview-container");
  const previewImg = document.getElementById("form-card-preview-img");
  if (previewContainer && previewImg && card.image) {
    previewImg.src = card.image;
    previewContainer.classList.remove("hidden");
  }
  
  // Style form button to show "Update" instead of "Save"
  document.getElementById("btn-save-card").innerHTML = `<i data-lucide="check-circle"></i> Update Card Details`;
  lucide.createIcons();
  
  // Scroll form into view
  document.getElementById("verification-panel").scrollIntoView({ behavior: "smooth" });
  showToast(`Editing entry for ${card.name}`, "info");
}

function clearForm() {
  editingCardId = null;
  document.getElementById("card-details-form").reset();
  document.getElementById("field-image-data").value = "";
  
  // Clear image reference preview
  const previewContainer = document.getElementById("form-card-preview-container");
  const previewImg = document.getElementById("form-card-preview-img");
  if (previewContainer) {
    previewContainer.classList.add("hidden");
  }
  if (previewImg) {
    previewImg.src = "";
  }
  
  document.getElementById("btn-save-card").innerHTML = `<i data-lucide="check-circle"></i> Save Card to Record List`;
  lucide.createIcons();
}

function saveCardData(event) {
  event.preventDefault();
  
  const name = document.getElementById("field-name").value.trim();
  const company = document.getElementById("field-company").value.trim();
  const dept = document.getElementById("field-dept").value.trim();
  const email = document.getElementById("field-email").value.trim();
  const mobile = document.getElementById("field-mobile").value.trim();
  const work = document.getElementById("field-work").value.trim();
  const website = document.getElementById("field-website").value.trim();
  const linkedin = document.getElementById("field-linkedin").value.trim();
  const address = document.getElementById("field-address").value.trim();
  const notes = document.getElementById("field-notes").value.trim();
  const image = document.getElementById("field-image-data").value;
  
  if (editingCardId) {
    // Update existing
    const cardIdx = cardsDB.findIndex(c => c.id === editingCardId);
    if (cardIdx !== -1) {
      cardsDB[cardIdx] = {
        ...cardsDB[cardIdx],
        name, company, dept, email, mobile, work, website, linkedin, address, notes,
        image: image || cardsDB[cardIdx].image // keep existing if new is blank
      };
      showToast("Card updated", "success");
    }
  } else {
    // Add new
    const newCard = {
      id: "card-" + Date.now(),
      name, company, dept, email, mobile, work, website, linkedin, address, notes,
      image: image || getDefaultFallbackImage(name, company, dept),
      selected: true
    };
    cardsDB.push(newCard);
    showToast("Card saved to database", "success");
  }
  
  saveDatabaseToStorage();
  clearForm();
  
  // Switch scanner preview back to normal state
  hidePreviewContainer();
}

function getDefaultFallbackImage(name, company, dept) {
  // Return an SVG fallback thumbnail indicating a blank or simulated card
  const cName = company || "Business Corp";
  const dName = dept || "Operations";
  return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='350' height='200' viewBox='0 0 350 200'><rect width='100%' height='100%' fill='%231f2937'/><text x='50%25' y='40%25' fill='%23ffffff' font-family='sans-serif' font-size='20' font-weight='bold' text-anchor='middle'>${escapeHTML(name)}</text><text x='50%25' y='58%25' fill='%2300f2fe' font-family='sans-serif' font-size='14' text-anchor='middle'>${escapeHTML(cName)}</text><text x='50%25' y='74%25' fill='%239ca3af' font-family='sans-serif' font-size='12' text-anchor='middle'>${escapeHTML(dName)}</text></svg>`;
}

function previewImageFullscreen(base64Image) {
  // Create a overlay modal to preview full size image
  const modal = document.createElement("div");
  modal.style.position = "fixed";
  modal.style.inset = "0";
  modal.style.backgroundColor = "rgba(0,0,0,0.95)";
  modal.style.zIndex = "1000";
  modal.style.display = "flex";
  modal.style.flexDirection = "column";
  modal.style.alignItems = "center";
  modal.style.justifyContent = "center";
  modal.style.padding = "2rem";
  
  const img = document.createElement("img");
  img.src = base64Image;
  img.style.maxWidth = "90%";
  img.style.maxHeight = "80vh";
  img.style.objectFit = "contain";
  img.style.borderRadius = "8px";
  img.style.border = "2px solid rgba(255,255,255,0.1)";
  
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Close Preview";
  closeBtn.className = "btn btn-secondary";
  closeBtn.style.marginTop = "1.5rem";
  closeBtn.onclick = () => document.body.removeChild(modal);
  
  modal.appendChild(img);
  modal.appendChild(closeBtn);
  document.body.appendChild(modal);
  
  modal.onclick = (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  };
}


// --- Tab Switching Navigation ---
function switchCaptureTab(tab) {
  activeTab = tab;
  document.getElementById("tab-webcam").className = tab === "webcam" ? "tab-btn active" : "tab-btn";
  document.getElementById("tab-upload").className = tab === "upload" ? "tab-btn active" : "tab-btn";
  
  document.getElementById("content-webcam").className = tab === "webcam" ? "tab-content active" : "tab-content";
  document.getElementById("content-upload").className = tab === "upload" ? "tab-content active" : "tab-content";
  
  resetScanPreview();
  
  if (tab === "webcam") {
    startCamera();
  } else {
    stopCamera();
  }
}

// --- Webcam Controller ---
function setupCameraEventListeners() {
  document.getElementById("btn-capture").addEventListener("click", capturePhoto);
  document.getElementById("btn-toggle-camera").addEventListener("click", toggleCamera);
  document.getElementById("btn-recapture").addEventListener("click", discardScan);
}

async function startCamera() {
  stopCamera();
  const video = document.getElementById("video-stream");
  const errorContainer = document.getElementById("camera-error");
  const scanLaser = document.getElementById("scan-laser");
  
  errorContainer.classList.add("hidden");
  scanLaser.classList.remove("hidden");
  
  // Configure camera constraints: use selected device if available, otherwise soft facingMode
  const videoConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 }
  };
  
  if (activeDeviceId) {
    videoConstraints.deviceId = { exact: activeDeviceId };
  } else {
    videoConstraints.facingMode = { ideal: activeFacingMode };
  }
  
  const constraints = {
    video: videoConstraints,
    audio: false
  };
  
  try {
    currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = currentStream;
    
    // Explicitly call play to start rendering stream, catch to prevent unhandled rejection
    video.play().catch(playErr => console.warn("Video auto-play interrupted:", playErr));
    
    // Fetch available devices once permissions are granted
    await updateCameraList();
  } catch (err) {
    console.warn("First camera search failed, retrying with general constraints...", err);
    try {
      // Fallback to any available video input if constraints failed
      currentStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      video.srcObject = currentStream;
      video.play().catch(playErr => console.warn("Video auto-play interrupted:", playErr));
      
      await updateCameraList();
    } catch (retryErr) {
      console.error("Camera access error:", retryErr);
      errorContainer.classList.remove("hidden");
      scanLaser.classList.add("hidden");
      showToast("Failed to initialize camera. Please try File Upload tab.", "danger");
    }
  }
}

function stopCamera() {
  const video = document.getElementById("video-stream");
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  }
  if (video) {
    video.srcObject = null;
  }
}

function toggleCamera() {
  activeFacingMode = activeFacingMode === "environment" ? "user" : "environment";
  startCamera();
}

function changeCamera(deviceId) {
  activeDeviceId = deviceId;
  startCamera();
}

async function updateCameraList() {
  const select = document.getElementById("camera-select");
  if (!select) return;
  
  try {
    // Check if enumerateDevices is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      select.innerHTML = '<option value="">Default Camera</option>';
      return;
    }
    
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    
    select.innerHTML = "";
    
    if (videoDevices.length === 0) {
      select.innerHTML = '<option value="">No cameras found</option>';
      return;
    }
    
    videoDevices.forEach((device, index) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = device.label || `Camera ${index + 1}`;
      if (device.deviceId === activeDeviceId || (!activeDeviceId && index === 0)) {
        option.selected = true;
      }
      select.appendChild(option);
    });
  } catch (e) {
    console.warn("Failed to enumerate camera devices:", e);
    select.innerHTML = '<option value="">Default Camera</option>';
  }
}

function capturePhoto() {
  const video = document.getElementById("video-stream");
  if (!currentStream) {
    showToast("Camera stream is not active. Try File Upload instead.", "danger");
    return;
  }
  
  let width = video.videoWidth;
  let height = video.videoHeight;
  
  // Fallback if metadata is not loaded yet
  if (!width || !height) {
    width = video.clientWidth || 640;
    height = video.clientHeight || 480;
  }
  
  // Capture snapshot on hidden canvas
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, width, height);
  
  const base64Image = canvas.toDataURL("image/jpeg", 0.9);
  stopCamera();
  
  processImageForOcr(base64Image);
}

// --- File Upload & Drag/Drop controller ---
function setupUploadEventListeners() {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("file-input");
  
  dropzone.addEventListener("click", () => fileInput.click());
  
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) handleImageFile(file);
  });
  
  // Drag and drop event styling
  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    }, false);
  });
  
  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    }, false);
  });
  
  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const file = dt.files[0];
    if (file) handleImageFile(file);
  });
}

function handleImageFile(file) {
  if (!file.type.startsWith("image/")) {
    showToast("Invalid file type. Please upload an image.", "danger");
    return;
  }
  
  const reader = new FileReader();
  reader.onload = (e) => {
    processImageForOcr(e.target.result);
  };
  reader.readAsDataURL(file);
}

function resizeImageIfNeeded(base64Image, maxWidth = 1200) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.width <= maxWidth) {
        resolve(base64Image);
        return;
      }
      
      const scale = maxWidth / img.width;
      const canvas = document.createElement("canvas");
      canvas.width = maxWidth;
      canvas.height = img.height * scale;
      
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      resolve(base64Image); // fallback
    };
    img.src = base64Image;
  });
}

// --- OCR Processing & Structuring Workflow ---
async function processImageForOcr(base64Image) {
  isProcessing = true;
  
  // Display Image in preview panel
  const previewContainer = document.getElementById("scan-preview-container");
  const previewImg = document.getElementById("scan-preview-img");
  const ocrOverlay = document.getElementById("ocr-overlay");
  
  // Hide inputs, show preview container
  document.getElementById("content-webcam").classList.add("hidden");
  document.getElementById("content-upload").classList.add("hidden");
  previewContainer.classList.remove("hidden");
  previewImg.src = base64Image;
  
  // Display OCR loader
  ocrOverlay.classList.remove("hidden");
  updateOcrStatus("Optimizing image size...", 10);
  
  try {
    const optimizedBase64 = await resizeImageIfNeeded(base64Image, 1000);
    currentOcrImage = optimizedBase64;
    
    updateOcrStatus("Initializing OCR Engine...", 20);
    runTesseractOcr(optimizedBase64);
  } catch (err) {
    console.error("Image optimization failed:", err);
    currentOcrImage = base64Image;
    updateOcrStatus("Initializing OCR Engine...", 20);
    runTesseractOcr(base64Image);
  }
}

function updateOcrStatus(message, progressVal) {
  document.getElementById("ocr-status-text").textContent = message;
  document.getElementById("ocr-progress-bar").style.width = `${progressVal}%`;
}

function discardScan() {
  hidePreviewContainer();
  clearForm();
}

function resetScanPreview() {
  document.getElementById("scan-preview-container").classList.add("hidden");
  document.getElementById("ocr-overlay").classList.add("hidden");
  currentOcrImage = null;
  isProcessing = false;
}

function hidePreviewContainer() {
  resetScanPreview();
  switchCaptureTab(activeTab);
}

// Local Tesseract.js Worker Scanning
async function runTesseractOcr(base64Image) {
  try {
    updateOcrStatus("Loading OCR worker language packages...", 25);
    
    // Tesseract Recognize syntax
    const result = await Tesseract.recognize(
      base64Image,
      'eng',
      {
        logger: m => {
          if (m.status === 'recognizing text') {
            const pct = Math.round(m.progress * 60) + 30; // mapping 0-1 to 30%-90%
            updateOcrStatus(`Scanning Business Card... (${Math.round(m.progress * 100)}%)`, pct);
          }
        }
      }
    );
    
    const extractedText = result.data.text;
    updateOcrStatus("Structuring contact details...", 95);
    console.log("Raw OCR Text:", extractedText);
    
    // Choose Structuring Method: Custom AI Studio or Regex fallback
    const geminiKey = localStorage.getItem("bizcard_settings_gemini_key");
    
    if (geminiKey && geminiKey.trim().length > 10) {
      await extractDetailsWithGemini(extractedText, base64Image, geminiKey.trim());
    } else {
      extractDetailsWithRegex(extractedText);
    }
    
  } catch (err) {
    console.error("Tesseract scan failed:", err);
    showToast("OCR scanning failed. Fallback to manual entry.", "danger");
    // Fallback to manual entry
    document.getElementById("ocr-overlay").classList.add("hidden");
    document.getElementById("field-image-data").value = base64Image;
  }
}

// --- Regex Parsing (Local Fallback Heuristics) ---
function extractDetailsWithRegex(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  
  let name = "";
  let company = "";
  let dept = "";
  let email = "";
  let mobile = "";
  let work = "";
  let website = "";
  let linkedin = "";
  let address = "";
  
  // Regular Expressions
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i;
  const phoneLooseRegex = /(\+?[0-9\s\-()]{9,18})/g;
  const webRegex = /(https?:\/\/)?(www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})(\/[a-zA-Z0-9-._~:\/?#[\]@!$&'()*+,;=]*)?/i;
  const linkedinRegex = /(https?:\/\/)?(www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+/i;
  
  // 1. Extract email
  for (const line of lines) {
    const match = line.match(emailRegex);
    if (match) {
      email = match[0];
      break;
    }
  }
  
  // 2. Extract phone numbers (mobile & work)
  let phoneMatches = [];
  let phoneMatch;
  while ((phoneMatch = phoneLooseRegex.exec(text)) !== null) {
    const cleaned = phoneMatch[0].replace(/[^0-9]/g, "");
    if (cleaned.length >= 7 && cleaned.length <= 15) {
      phoneMatches.push(phoneMatch[0].trim());
    }
  }
  if (phoneMatches.length > 0) {
    mobile = phoneMatches[0];
  }
  if (phoneMatches.length > 1) {
    work = phoneMatches[1];
  }
  
  // 3. Extract LinkedIn & Website
  for (const line of lines) {
    const liMatch = line.match(linkedinRegex);
    if (liMatch) {
      linkedin = liMatch[0];
      continue;
    }
    
    if (line.includes("@")) continue;
    const match = line.match(webRegex);
    if (match) {
      const url = match[0];
      if (url.toLowerCase().includes("linkedin.com")) {
        linkedin = url;
      } else {
        website = url;
      }
    }
  }
  
  // 4. Try parsing Name, Dept, Company via position-based line heuristics
  const filteredLines = lines.filter(line => {
    const isEmail = emailRegex.test(line);
    const isWeb = webRegex.test(line);
    const hasPhone = /[0-9]{5,}/.test(line.replace(/[^0-9]/g, ""));
    return !isEmail && !isWeb && !hasPhone;
  });
  
  const deptKeywords = ["development", "engineering", "sales", "marketing", "operations", "finance", "accounting", "hr", "human resources", "product", "design", "creative", "support", "customer service", "legal"];
  
  if (filteredLines.length > 0) {
    name = filteredLines[0]; // first line is assumed name
  }
  
  if (filteredLines.length > 1) {
    const line1 = filteredLines[1];
    const containsDeptKeyword = deptKeywords.some(keyword => line1.toLowerCase().includes(keyword));
    
    if (containsDeptKeyword) {
      dept = line1;
      if (filteredLines.length > 2) company = filteredLines[2];
    } else {
      company = line1;
      // check if third line contains dept keywords
      if (filteredLines.length > 2) {
        const line2 = filteredLines[2];
        if (deptKeywords.some(keyword => line2.toLowerCase().includes(keyword))) {
          dept = line2;
        }
      }
    }
  }
  
  // 5. Build Address from leftover lines containing keywords
  const addressKeywords = ["street", "st", "drive", "dr", "lane", "ln", "road", "rd", "avenue", "ave", "boulevard", "blvd", "suite", "ste", "floor", "fl", "building", "bldg", "plaza", "highway", "hwy", "box", "p.o.", "way", "parkway", "pkwy"];
  const addressParts = [];
  
  lines.forEach(line => {
    // Skip matched elements
    if (line === name || line === dept || line === company || line.includes(email) || (website && line.includes(website)) || (linkedin && line.includes(linkedin)) || (mobile && line.includes(mobile)) || (work && line.includes(work))) {
      return;
    }
    
    const lowerLine = line.toLowerCase();
    const hasAddressKw = addressKeywords.some(kw => new RegExp(`\\b${kw}\\b`, "i").test(lowerLine));
    const hasStateZip = /[A-Z]{2}\s+\d{5}/.test(line) || /\b\d{5}\b/.test(line); // state codes or zipcode
    
    if (hasAddressKw || hasStateZip) {
      addressParts.push(line);
    }
  });
  
  if (addressParts.length > 0) {
    address = addressParts.join(", ");
  }

  // Set values into inputs
  document.getElementById("field-name").value = name;
  document.getElementById("field-company").value = company;
  document.getElementById("field-dept").value = dept;
  document.getElementById("field-mobile").value = mobile;
  document.getElementById("field-work").value = work;
  document.getElementById("field-email").value = email;
  document.getElementById("field-website").value = website.startsWith("http") ? website : (website ? "https://" + website : "");
  document.getElementById("field-linkedin").value = linkedin.startsWith("http") ? linkedin : (linkedin ? "https://" + linkedin : "");
  document.getElementById("field-address").value = address;
  document.getElementById("field-notes").value = `=== Raw Scanned OCR Text ===\n${text}`;
  document.getElementById("field-image-data").value = currentOcrImage;
  
  // Show image reference preview
  const formPreviewImg = document.getElementById("form-card-preview-img");
  const formPreviewContainer = document.getElementById("form-card-preview-container");
  if (formPreviewImg && formPreviewContainer && currentOcrImage) {
    formPreviewImg.src = currentOcrImage;
    formPreviewContainer.classList.remove("hidden");
  }
  
  // Hide loader
  document.getElementById("ocr-overlay").classList.add("hidden");
  showToast("OCR complete! Please check and confirm fields.", "success");
}

// --- Gemini 1.5 Flash vision extraction logic ---
async function extractDetailsWithGemini(ocrText, base64Image, apiKey) {
  try {
    updateOcrStatus("Refining details with Gemini AI...", 98);
    
    const rawBase64 = base64Image.split(",")[1];
    
    // Construct the Gemini request payload
    const promptText = `
      You are a professional assistant specialized in digitization. Analyze this business card image and transcription.
      Extract contact details into a clean JSON structure.
      
      JSON schema to return:
      {
        "name": "Full Name",
        "company": "Company / Organization Name",
        "dept": "Department or Division (e.g. Sales, Marketing, IT, Finance, Engineering)",
        "email": "Email Address",
        "mobile": "Mobile/Cell Phone Number (standardized format)",
        "work": "Work/Office Phone Number (standardized format)",
        "website": "Website URL (excluding LinkedIn links)",
        "linkedin": "LinkedIn Profile URL (e.g., https://www.linkedin.com/in/username)",
        "address": "Full Physical Address",
        "notes": "Any other key details like taglines, logo descriptions or other text"
      }
      
      CRITICAL: Return ONLY raw, valid JSON. Do not include markdown code block formatting (like \`\`\`json). Just the json string.
      If a field is not present on the card, set it to an empty string "".
      
      Extracted OCR reference text:
      """
      ${ocrText}
      """
    `;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: promptText },
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: rawBase64
                }
              }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`Gemini API Error: Status ${response.status}`);
    }
    
    const resData = await response.json();
    let responseText = resData.candidates[0].content.parts[0].text;
    
    // Clean JSON response
    responseText = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
    
    const details = JSON.parse(responseText);
    
    // Set details to form fields
    document.getElementById("field-name").value = details.name || "";
    document.getElementById("field-company").value = details.company || "";
    document.getElementById("field-dept").value = details.dept || "";
    document.getElementById("field-email").value = details.email || "";
    document.getElementById("field-mobile").value = details.mobile || "";
    document.getElementById("field-work").value = details.work || "";
    document.getElementById("field-website").value = details.website || "";
    document.getElementById("field-linkedin").value = details.linkedin || "";
    document.getElementById("field-address").value = details.address || "";
    
    const finalNotes = details.notes ? `${details.notes}\n\n` : "";
    document.getElementById("field-notes").value = `${finalNotes}=== Raw Scanned OCR Text ===\n${ocrText}`;
    document.getElementById("field-image-data").value = base64Image;
    
    // Show image reference preview
    const formPreviewImg = document.getElementById("form-card-preview-img");
    const formPreviewContainer = document.getElementById("form-card-preview-container");
    if (formPreviewImg && formPreviewContainer) {
      formPreviewImg.src = base64Image;
      formPreviewContainer.classList.remove("hidden");
    }
    
    document.getElementById("ocr-overlay").classList.add("hidden");
    showToast("Gemini AI successfully extracted details!", "success");
    
  } catch (err) {
    console.error("Gemini Extraction Error:", err);
    showToast("Gemini AI failed, using default regex parsing instead...", "warning");
    extractDetailsWithRegex(ocrText);
  }
}

// --- Imgbb Image Host Upload ---
async function uploadToImgbb(base64Image, apiKey) {
  try {
    const rawBase64 = base64Image.split(",")[1];
    
    const formData = new FormData();
    formData.append("image", rawBase64);
    
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
      method: "POST",
      body: formData
    });
    
    if (!response.ok) {
      throw new Error("Imgbb upload endpoint rejected image");
    }
    
    const res = await response.json();
    return res.data.url; // Returns direct JPG url
  } catch (e) {
    console.error("Imgbb upload failed:", e);
    throw new Error("Image upload to Imgbb failed. Please check API Key.");
  }
}

// --- Excel Creation & JSZip Compiler ---
async function triggerExport() {
  const selectedCards = cardsDB.filter(c => c.selected);
  
  if (selectedCards.length === 0) {
    showToast("Please select at least one card to export.", "warning");
    return;
  }
  
  const exportMode = document.querySelector('input[name="export-mode"]:checked').value;
  
  showToast("Compiling export packages...", "info");
  
  if (exportMode === "zip") {
    await exportAsLocalZip(selectedCards);
  } else if (exportMode === "cloud") {
    await exportAsCloudExcel(selectedCards);
  }
}

// Method 1: Export offline ZIP containing images/ and excel sheet with relative links
async function exportAsLocalZip(cards) {
  try {
    const zip = new JSZip();
    const imgFolder = zip.folder("images");
    
    // We map Excel cells row-by-row
    const excelRows = [];
    
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const imgFileName = `card_${i + 1}.jpg`;
      
      // Convert base64 data to blob and add to ZIP images folder
      if (card.image && card.image.startsWith("data:")) {
        const response = await fetch(card.image);
        const blob = await response.blob();
        imgFolder.file(imgFileName, blob);
      }
      
      excelRows.push({
        "Card ID": i + 1,
        "Name": card.name,
        "Company": card.company,
        "Department": card.dept,
        "Mobile Phone": card.mobile,
        "Work Phone": card.work,
        "Email": card.email,
        "Website": card.website,
        "LinkedIn": card.linkedin,
        "Address": card.address,
        "Photo Hyperlink": `images/${imgFileName}`, // Relative URL placeholder
        "Notes": card.notes
      });
    }
    
    // Create spreadsheet worksheet
    const worksheet = XLSX.utils.json_to_sheet(excelRows);
    
    // Inject cell HYPERLINKS into Photo Hyperlink column (which is Column K in 0-indexed, col index 10)
    for (let i = 0; i < excelRows.length; i++) {
      const rowIndex = i + 2; // header is row 1, data starts at 2
      const cellAddress = `K${rowIndex}`;
      const relativePath = excelRows[i]["Photo Hyperlink"];
      
      // Configure SheetJS cell to use local file hyperlink
      worksheet[cellAddress] = {
        t: 's',
        v: 'View Image File',
        l: { 
          Target: relativePath, 
          Tooltip: 'Click to open local business card photo' 
        }
      };
    }
    
    // Build workbook
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Business Cards");
    
    // Write Excel binary buffer
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    
    // Add Excel file to JSZip
    zip.file("scanned_business_cards.xlsx", excelBuffer);
    
    // Add README info file explaining links
    const readme = `BIZCARD SNAP EXPORT PACKAGE
=============================
This ZIP package contains:
1. "scanned_business_cards.xlsx" - Excel database.
2. "images/" - Folder containing card snapshot photos.

IMPORTANT NOTE:
The "Photo Hyperlink" column in the Excel file uses local relative file paths (e.g. images/card_1.jpg). 
To make links work properly, do NOT separate the Excel file from the "images" folder. 
Keep both extracted in the same folder directory together!`;
    zip.file("README_FIRST.txt", readme);
    
    // Compile and trigger download
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const downloadLink = document.createElement("a");
    downloadLink.href = URL.createObjectURL(zipBlob);
    downloadLink.download = `BizCards_Archive_${Date.now()}.zip`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    
    showToast("Local ZIP package exported successfully!", "success");
    
  } catch (err) {
    console.error("Local ZIP compilation failed:", err);
    showToast("Export failed: " + err.message, "danger");
  }
}

// Method 2: Upload images to Imgbb cloud and download standalone Excel sheet
async function exportAsCloudExcel(cards) {
  const imgbbKey = localStorage.getItem("bizcard_settings_imgbb_key");
  
  if (!imgbbKey || imgbbKey.trim().length === 0) {
    showToast("Cloud Export requires an Imgbb API Key in settings.", "danger");
    // Open settings drawer for key entry
    settingsDrawer.classList.add("active");
    return;
  }
  
  // Prompt overlay for uploading steps
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.backgroundColor = "rgba(10, 10, 15, 0.9)";
  overlay.style.zIndex = "1000";
  overlay.style.display = "flex";
  overlay.style.flexDirection = "column";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.gap = "1.5rem";
  overlay.innerHTML = `
    <div class="loader-spinner"></div>
    <div style="text-align: center;">
      <h3 style="margin-bottom: 0.5rem;">Uploading photos to cloud storage...</h3>
      <p id="cloud-upload-status" style="color: #94a3b8; font-size: 0.9rem;">Processing card 1 of ${cards.length}...</p>
    </div>
  `;
  document.body.appendChild(overlay);
  
  try {
    const excelRows = [];
    
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      document.getElementById("cloud-upload-status").textContent = `Uploading photo of ${card.name} (card ${i + 1} of ${cards.length})...`;
      
      let imageUrlLink = "";
      
      if (card.image && card.image.startsWith("data:")) {
        // Upload to imgbb
        imageUrlLink = await uploadToImgbb(card.image, imgbbKey.trim());
      } else {
        // If image is already URL (e.g. from mock sandbox)
        imageUrlLink = card.image;
      }
      
      excelRows.push({
        "Card ID": i + 1,
        "Name": card.name,
        "Company": card.company,
        "Department": card.dept,
        "Mobile Phone": card.mobile,
        "Work Phone": card.work,
        "Email": card.email,
        "Website": card.website,
        "LinkedIn": card.linkedin,
        "Address": card.address,
        "Photo Link": imageUrlLink,
        "Notes": card.notes
      });
    }
    
    document.getElementById("cloud-upload-status").textContent = "Creating Excel Workbook...";
    
    const worksheet = XLSX.utils.json_to_sheet(excelRows);
    
    // Inject hyperlinks to public URLs (Column K, Index 10)
    for (let i = 0; i < excelRows.length; i++) {
      const rowIndex = i + 2;
      const cellAddress = `K${rowIndex}`;
      const publicLink = excelRows[i]["Photo Link"];
      
      if (publicLink) {
        worksheet[cellAddress] = {
          t: 's',
          v: 'View Public Image',
          l: { 
            Target: publicLink, 
            Tooltip: 'Click to view card photo online' 
          }
        };
      }
    }
    
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Business Cards");
    
    // Write spreadsheet
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const excelBlob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    
    const downloadLink = document.createElement("a");
    downloadLink.href = URL.createObjectURL(excelBlob);
    downloadLink.download = `BizCards_Export_${Date.now()}.xlsx`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    
    document.body.removeChild(overlay);
    showToast("Excel spreadsheet generated successfully!", "success");
    
  } catch (err) {
    console.error("Cloud Export Error:", err);
    if (document.body.contains(overlay)) {
      document.body.removeChild(overlay);
    }
    showToast("Export failed: " + err.message, "danger");
  }
}
