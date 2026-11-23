(function () {
  // The webhook URL lives in config.js (not committed to git).
  const WEBHOOK_URL = (window.APP_CONFIG && window.APP_CONFIG.WEBHOOK_URL) || "";
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 2;
  const ZOOM_STEP = 0.25;

  const $ = (id) => document.getElementById(id);
  const dropzone = $("dropzone");
  const fileInput = $("file-input");
  const uploadLabel = $("upload-label");
  const frame = $("pdf-frame");
  const viewer = $("pdf-viewer");
  const errorEl = $("upload-error");
  const clearBtn = $("clear-btn");
  const chip = $("file-chip");
  const toolbar = $("toolbar");
  const zoomIn = $("zoom-in");
  const zoomOut = $("zoom-out");
  const zoomLabel = $("zoom-label");
  const form = $("chat-form");
  const input = $("chat-input");
  const messages = $("messages");
  const suggestions = $("suggestions");

  const sendBtn = form.querySelector("button[type=submit]");

  let objectUrl = null;
  let currentFile = null;
  let busy = false;
  let zoom = 1;

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = !msg;
  }

  function formatSize(bytes) {
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function applyZoom() {
    // Render the viewer at 1/zoom of the frame size, then scale it, so the
    // PDF viewer's own scrolling keeps working at every zoom level.
    viewer.style.width = 100 / zoom + "%";
    viewer.style.height = 100 / zoom + "%";
    viewer.style.transform = "scale(" + zoom + ")";
    zoomLabel.textContent = Math.round(zoom * 100) + "%";
    zoomOut.disabled = zoom <= ZOOM_MIN;
    zoomIn.disabled = zoom >= ZOOM_MAX;
  }

  function setZoom(value) {
    zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 100) / 100));
    applyZoom();
  }

  function loadFile(file) {
    if (!file) return;
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      showError("Please upload a PDF file.");
      return;
    }
    showError("");
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    currentFile = file;
    viewer.src = objectUrl;
    frame.hidden = false;
    dropzone.hidden = true;
    toolbar.hidden = false;
    chip.textContent = file.name + " · " + formatSize(file.size);
    chip.title = file.name;
    chip.hidden = false;
    uploadLabel.textContent = "Replace contract";
    setZoom(1);
    addMessage("Loaded " + file.name, "notice");
  }

  function clearFile() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    currentFile = null;
    viewer.removeAttribute("src");
    frame.hidden = true;
    dropzone.hidden = false;
    toolbar.hidden = true;
    chip.hidden = true;
    uploadLabel.textContent = "Upload contract";
    fileInput.value = "";
  }

  fileInput.addEventListener("change", () => loadFile(fileInput.files[0]));
  clearBtn.addEventListener("click", clearFile);
  zoomIn.addEventListener("click", () => setZoom(zoom + ZOOM_STEP));
  zoomOut.addEventListener("click", () => setZoom(zoom - ZOOM_STEP));

  ["dragenter", "dragover"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
    })
  );
  dropzone.addEventListener("drop", (e) => loadFile(e.dataTransfer.files[0]));

  function addMessage(text, who) {
    const el = document.createElement("div");
    el.className = "msg " + who;
    el.textContent = text;
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
    return el;
  }

  // Assistant reply: answer, then citations and reasoning beneath it.
  function addAssistantReply(data) {
    const el = document.createElement("div");
    el.className = "msg bot reply";

    const answer = document.createElement("div");
    answer.className = "reply-answer";
    answer.textContent = data.response;
    el.appendChild(answer);

    if (data.citation.length) {
      const section = document.createElement("div");
      section.className = "reply-section";
      const label = document.createElement("div");
      label.className = "reply-label";
      label.textContent = data.citation.length === 1 ? "Citation" : "Citations";
      section.appendChild(label);
      data.citation.forEach((c) => {
        const q = document.createElement("blockquote");
        q.className = "citation";
        q.textContent = c;
        section.appendChild(q);
      });
      el.appendChild(section);
    }

    if (data.reasoning) {
      const section = document.createElement("div");
      section.className = "reply-section";
      const label = document.createElement("div");
      label.className = "reply-label";
      label.textContent = "Reasoning";
      const p = document.createElement("div");
      p.className = "reply-reasoning";
      p.textContent = data.reasoning;
      section.append(label, p);
      el.appendChild(section);
    }

    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
  }

  // Validate / normalise the webhook JSON to { response, citation[], reasoning }.
  function normalise(payload) {
    if (Array.isArray(payload)) payload = payload[0];
    if (!payload || typeof payload !== "object" || typeof payload.response !== "string") {
      throw new Error("Unexpected response format from the webhook.");
    }
    return {
      response: payload.response,
      citation: Array.isArray(payload.citation)
        ? payload.citation.filter((c) => typeof c === "string")
        : [],
      reasoning: typeof payload.reasoning === "string" ? payload.reasoning : "",
    };
  }

  async function askWebhook(file, message) {
    if (!WEBHOOK_URL) {
      throw new Error("No webhook URL set. Copy config.example.js to config.js and add your URL.");
    }
    const body = new FormData();
    body.append("file", file, file.name);
    body.append("message", message);

    const res = await fetch(WEBHOOK_URL, { method: "POST", body });
    if (!res.ok) throw new Error("The webhook returned an error (HTTP " + res.status + ").");
    const text = await res.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (_) {
      throw new Error("The webhook did not return valid JSON.");
    }
    return normalise(payload);
  }

  async function send(text) {
    if (busy) return;
    if (!currentFile) {
      addMessage("Please upload a contract first, then ask your question.", "notice");
      return;
    }
    busy = true;
    sendBtn.disabled = true;
    addMessage(text, "user");
    suggestions.hidden = true;

    const typing = document.createElement("div");
    typing.className = "msg bot typing";
    typing.setAttribute("aria-label", "Assistant is typing");
    typing.innerHTML = "<span></span><span></span><span></span>";
    messages.appendChild(typing);
    messages.scrollTop = messages.scrollHeight;

    try {
      const data = await askWebhook(currentFile, text);
      typing.remove();
      addAssistantReply(data);
    } catch (err) {
      typing.remove();
      const failed = err instanceof TypeError
        ? "Couldn't reach the webhook. Check your connection and that the n8n workflow is listening, then try again."
        : err.message;
      addMessage(failed, "error");
    } finally {
      busy = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    if (!currentFile) {
      addMessage("Please upload a contract first, then ask your question.", "notice");
      return;
    }
    input.value = "";
    send(text);
  });

  suggestions.addEventListener("click", (e) => {
    const btn = e.target.closest(".suggestion");
    if (btn) send(btn.textContent);
  });
})();
