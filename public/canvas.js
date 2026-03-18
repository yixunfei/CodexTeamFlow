const state = {
  tasks: [],
  selectedTaskId: null,
  selectedTask: null,
  config: null,
  lastTaskAction: "plan",
};

const refs = {
  backendChip: document.querySelector("#backend-chip"),
  restartChip: document.querySelector("#restart-chip"),
  refreshAllButton: document.querySelector("#refresh-all-button"),
  taskCount: document.querySelector("#task-count"),
  taskList: document.querySelector("#task-list"),
  taskForm: document.querySelector("#task-form"),
  goalInput: document.querySelector("#goal-input"),
  constraintsInput: document.querySelector("#constraints-input"),
  waitCheckbox: document.querySelector("#wait-checkbox"),
  emptyState: document.querySelector("#empty-state"),
  taskView: document.querySelector("#task-view"),
  taskTitle: document.querySelector("#task-title"),
  taskSummary: document.querySelector("#task-summary"),
  taskStatus: document.querySelector("#task-status"),
  taskBackend: document.querySelector("#task-backend"),
  taskStage: document.querySelector("#task-stage"),
  taskUpdated: document.querySelector("#task-updated"),
  rerunButton: document.querySelector("#rerun-button"),
  reviewButton: document.querySelector("#review-button"),
  cancelButton: document.querySelector("#cancel-button"),
  stageLane: document.querySelector("#stage-lane"),
  runtimeGrid: document.querySelector("#runtime-grid"),
  historyList: document.querySelector("#history-list"),
  configPath: document.querySelector("#config-path"),
  configBanner: document.querySelector("#config-banner"),
  configForm: document.querySelector("#config-form"),
  resetConfigButton: document.querySelector("#reset-config-button"),
  toast: document.querySelector("#toast"),
};

const stageOrder = ["plan", "implement", "review", "test"];

boot().catch((error) => {
  showToast(error.message || String(error), "danger", 5000);
});

async function boot() {
  bindEvents();
  await Promise.all([loadConfig(), loadTasks()]);
  window.setInterval(() => {
    void refreshTasks();
  }, 4000);
}

function bindEvents() {
  refs.refreshAllButton.addEventListener("click", () => {
    void Promise.all([loadConfig(), loadTasks()]);
  });

  refs.taskForm.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }

    if (target.dataset.action) {
      state.lastTaskAction = target.dataset.action;
    }
  });

  refs.taskForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitTaskForm();
  });

  refs.rerunButton.addEventListener("click", () => {
    if (!state.selectedTaskId) {
      return;
    }

    void runTask(state.selectedTaskId, false);
  });

  refs.reviewButton.addEventListener("click", () => {
    if (!state.selectedTaskId) {
      return;
    }

    void refreshReview(state.selectedTaskId);
  });

  refs.cancelButton.addEventListener("click", () => {
    if (!state.selectedTaskId) {
      return;
    }

    void cancelTask(state.selectedTaskId);
  });

  refs.configForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveConfig();
  });

  refs.resetConfigButton.addEventListener("click", () => {
    void resetConfig();
  });
}

async function loadConfig() {
  state.config = await fetchJson("/api/dashboard/config");
  renderConfig();
}

async function loadTasks() {
  const payload = await fetchJson("/api/dashboard/tasks");
  state.tasks = payload.tasks || [];

  if (!state.selectedTaskId) {
    state.selectedTaskId = payload.selectedTaskId || state.tasks[0]?.id || null;
  }

  renderTaskList();

  if (state.selectedTaskId) {
    await loadTask(state.selectedTaskId);
  } else {
    renderTask(null);
  }
}

async function refreshTasks() {
  const currentSelection = state.selectedTaskId;
  const payload = await fetchJson("/api/dashboard/tasks");
  state.tasks = payload.tasks || [];

  if (currentSelection && state.tasks.some((task) => task.id === currentSelection)) {
    state.selectedTaskId = currentSelection;
  } else {
    state.selectedTaskId = payload.selectedTaskId || state.tasks[0]?.id || null;
  }

  renderTaskList();

  if (state.selectedTaskId) {
    await loadTask(state.selectedTaskId);
  } else {
    renderTask(null);
  }
}

async function loadTask(taskId) {
  state.selectedTask = await fetchJson(`/api/dashboard/tasks/${encodeURIComponent(taskId)}`);
  renderTask(state.selectedTask);
}

function renderTaskList() {
  refs.taskCount.textContent = `${state.tasks.length} task${state.tasks.length === 1 ? "" : "s"}`;

  if (!state.tasks.length) {
    refs.taskList.innerHTML = `<div class="task-card"><p>No tasks yet. Create one from the form above.</p></div>`;
    return;
  }

  refs.taskList.innerHTML = state.tasks
    .map((task) => {
      const active = task.id === state.selectedTaskId ? "active" : "";
      return `
        <article class="task-card ${active}" data-task-id="${escapeHtml(task.id)}">
          <p class="section-kicker">${escapeHtml(task.status)}</p>
          <h3>${escapeHtml(task.goal)}</h3>
          <p>${escapeHtml(task.summary || summarizeTask(task))}</p>
          <div class="task-card-meta">
            <span>${escapeHtml(task.backend)}</span>
            <span>${escapeHtml(formatDateTime(task.updatedAt))}</span>
          </div>
        </article>
      `;
    })
    .join("");

  refs.taskList.querySelectorAll("[data-task-id]").forEach((element) => {
    element.addEventListener("click", () => {
      state.selectedTaskId = element.getAttribute("data-task-id");
      renderTaskList();
      if (state.selectedTaskId) {
        void loadTask(state.selectedTaskId);
      }
    });
  });
}

function renderTask(task) {
  if (!task) {
    refs.emptyState.classList.remove("hidden");
    refs.taskView.classList.add("hidden");
    return;
  }

  refs.emptyState.classList.add("hidden");
  refs.taskView.classList.remove("hidden");
  refs.taskTitle.textContent = task.goal;
  refs.taskSummary.textContent = task.summary || summarizeTask(task);
  refs.taskStatus.textContent = task.status;
  refs.taskBackend.textContent = task.backend;
  refs.taskStage.textContent = task.currentStage || "none";
  refs.taskUpdated.textContent = formatDateTime(task.updatedAt);
  refs.stageLane.innerHTML = renderStageLane(task);
  refs.runtimeGrid.innerHTML = renderRuntime(task);
  refs.historyList.innerHTML = renderHistory(task.history || []);
}

function renderStageLane(task) {
  return stageOrder
    .map((stage) => {
      const artifact = artifactForStage(task, stage);
      const tone = stageTone(task, stage, artifact);
      const badge = stageBadge(task, stage, artifact);
      const body = stageBody(stage, artifact);
      return `
        <article class="stage-card ${tone}">
          <div class="stage-header">
            <div>
              <p class="section-kicker">${escapeHtml(stage)}</p>
              <h3>${escapeHtml(stageTitle(stage))}</h3>
            </div>
            <span class="stage-badge">${escapeHtml(badge)}</span>
          </div>
          <div class="stage-copy">${body}</div>
        </article>
      `;
    })
    .join("");
}

function renderRuntime(task) {
  const runtime = task.runtimeState || {};
  const pairs = [
    ["Trace id", runtime.traceId || "n/a"],
    ["Last response", runtime.lastResponseId || "n/a"],
    ["Last agent", runtime.lastAgent || "n/a"],
    ["Runtime mode", runtime.mode || "n/a"],
    ["Cancel requested", String(Boolean(task.cancelRequested))],
    ["Created", formatDateTime(task.createdAt)],
  ];

  return pairs
    .map(
      ([label, value]) =>
        `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value))}</dd>`,
    )
    .join("");
}

function renderHistory(history) {
  if (!history.length) {
    return `<div class="history-entry"><p>No history yet.</p></div>`;
  }

  return history
    .slice(-8)
    .reverse()
    .map(
      (entry) => `
        <div class="history-entry">
          <div>
            <time>${escapeHtml(formatDateTime(entry.at))}</time>
            <strong>${escapeHtml(entry.stage)}</strong>
          </div>
          <p>${escapeHtml(entry.message)}</p>
        </div>
      `,
    )
    .join("");
}

function renderConfig() {
  const snapshot = state.config;
  if (!snapshot) {
    return;
  }

  refs.configPath.textContent = snapshot.configPath;
  refs.backendChip.textContent = `Current runtime: ${snapshot.current.runtimeMode}`;
  refs.backendChip.className = `status-chip ${snapshot.current.runtimeMode === "agents" ? "success" : "warning"}`;

  if (snapshot.restartRequired) {
    refs.restartChip.textContent = "Saved changes need restart";
    refs.restartChip.className = "status-chip warning";
    refs.configBanner.className = "notice-banner warning";
    refs.configBanner.textContent = `Saved overrides are ready.\nRestart the HTTP server to apply: ${snapshot.changedKeys.join(", ")}`;
    refs.configBanner.classList.remove("hidden");
  } else {
    refs.restartChip.textContent = "No restart pending";
    refs.restartChip.className = "status-chip success";
    refs.configBanner.className = "notice-banner success";
    refs.configBanner.textContent = snapshot.apiKeyConfigured
      ? "OPENAI_API_KEY is available for the current process."
      : "OPENAI_API_KEY is not set. Live agents mode will not run until it is configured.";
    refs.configBanner.classList.remove("hidden");
  }

  const form = refs.configForm;
  Object.entries(snapshot.pending).forEach(([key, value]) => {
    const input = form.elements.namedItem(key);
    if (!(input instanceof HTMLElement)) {
      return;
    }

    if (input instanceof HTMLInputElement && input.type === "checkbox") {
      input.checked = Boolean(value);
    } else if (
      input instanceof HTMLInputElement ||
      input instanceof HTMLTextAreaElement ||
      input instanceof HTMLSelectElement
    ) {
      input.value = String(value);
    }
  });

  Array.from(form.querySelectorAll(".field")).forEach((field) => field.classList.remove("locked"));
  Array.from(form.elements).forEach((element) => {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) {
      return;
    }

    if (!element.name) {
      return;
    }

    const locked = snapshot.lockedKeys.includes(element.name);
    element.disabled = locked;
    const field = element.closest(".field");
    if (field) {
      field.classList.toggle("locked", locked);
    }
  });
}

async function submitTaskForm() {
  const goal = refs.goalInput.value.trim();
  const constraints = parseConstraints(refs.constraintsInput.value);

  if (!goal) {
    showToast("Please provide a goal before creating a task.", "danger");
    return;
  }

  setTaskFormBusy(true);
  try {
    if (state.lastTaskAction === "run") {
      const result = await fetchJson("/api/dashboard/tasks/run", {
        method: "POST",
        body: JSON.stringify({
          goal,
          constraints,
          waitForCompletion: refs.waitCheckbox.checked,
        }),
      });
      state.selectedTaskId = result.task.id;
      showToast(`Workflow started for ${result.task.id}.`, "success");
    } else {
      const task = await fetchJson("/api/dashboard/tasks/plan", {
        method: "POST",
        body: JSON.stringify({
          goal,
          constraints,
        }),
      });
      state.selectedTaskId = task.id;
      showToast(`Plan created for ${task.id}.`, "success");
    }

    refs.taskForm.reset();
    refs.waitCheckbox.checked = false;
    await refreshTasks();
  } finally {
    setTaskFormBusy(false);
  }
}

async function runTask(taskId, waitForCompletion) {
  setTaskButtonsBusy(true);
  try {
    await fetchJson("/api/dashboard/tasks/run", {
      method: "POST",
      body: JSON.stringify({
        taskId,
        constraints: [],
        waitForCompletion,
      }),
    });
    showToast(`Run requested for ${taskId}.`, "success");
    await refreshTasks();
  } finally {
    setTaskButtonsBusy(false);
  }
}

async function refreshReview(taskId) {
  setTaskButtonsBusy(true);
  try {
    await fetchJson(`/api/dashboard/tasks/${encodeURIComponent(taskId)}/review`, {
      method: "POST",
    });
    showToast(`Review refreshed for ${taskId}.`, "success");
    await refreshTasks();
  } finally {
    setTaskButtonsBusy(false);
  }
}

async function cancelTask(taskId) {
  setTaskButtonsBusy(true);
  try {
    await fetchJson(`/api/dashboard/tasks/${encodeURIComponent(taskId)}/cancel`, {
      method: "POST",
    });
    showToast(`Cancellation requested for ${taskId}.`, "warning");
    await refreshTasks();
  } finally {
    setTaskButtonsBusy(false);
  }
}

async function saveConfig() {
  const payload = collectConfigForm();
  setConfigBusy(true);
  try {
    state.config = await fetchJson("/api/dashboard/config", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    renderConfig();
    showToast("Config overrides saved. Restart the server if the banner says so.", "success");
  } finally {
    setConfigBusy(false);
  }
}

async function resetConfig() {
  setConfigBusy(true);
  try {
    state.config = await fetchJson("/api/dashboard/config/reset", {
      method: "POST",
    });
    renderConfig();
    showToast("Saved config overrides cleared.", "warning");
  } finally {
    setConfigBusy(false);
  }
}

function collectConfigForm() {
  const formData = new FormData(refs.configForm);
  const payload = {
    runtimeMode: String(formData.get("runtimeMode")),
    liveNarration: refs.configForm.elements.namedItem("liveNarration").checked,
    model: String(formData.get("model") || ""),
    managerModel: String(formData.get("managerModel") || ""),
    plannerModel: String(formData.get("plannerModel") || ""),
    implementerModel: String(formData.get("implementerModel") || ""),
    reviewerModel: String(formData.get("reviewerModel") || ""),
    testerModel: String(formData.get("testerModel") || ""),
    transportMode: String(formData.get("transportMode")),
    httpHost: String(formData.get("httpHost") || ""),
    httpPort: Number.parseInt(String(formData.get("httpPort") || "0"), 10),
    httpPath: String(formData.get("httpPath") || ""),
    storePath: String(formData.get("storePath") || ""),
  };

  for (const key of state.config?.lockedKeys || []) {
    delete payload[key];
  }

  return payload;
}

function artifactForStage(task, stage) {
  if (stage === "plan") {
    return task.plan;
  }
  if (stage === "implement") {
    return task.implementation;
  }
  if (stage === "review") {
    return task.review;
  }
  return task.test;
}

function stageTone(task, stage, artifact) {
  if (task.status === "failed" && task.currentStage === stage) {
    return "failed";
  }
  if (task.status === "cancelled" && task.currentStage === stage) {
    return "failed";
  }
  if (stage === "test" && artifact?.status === "warning") {
    return "warning";
  }
  if (task.currentStage === stage && task.status === "running") {
    return "active";
  }
  return artifact ? "completed" : "";
}

function stageBadge(task, stage, artifact) {
  if (task.status === "failed" && task.currentStage === stage) {
    return "failed";
  }
  if (task.status === "cancelled") {
    return "cancelled";
  }
  if (task.currentStage === stage && task.status === "running") {
    return "in progress";
  }
  if (stage === "test" && artifact?.status === "warning") {
    return "warning";
  }
  return artifact ? "ready" : "pending";
}

function stageBody(stage, artifact) {
  if (!artifact) {
    return `<p>No artifact has been generated for this stage yet.</p>`;
  }

  if (stage === "plan") {
    return `${renderList("Steps", artifact.steps || [])}${renderList("Risks", artifact.risks || [])}`;
  }

  if (stage === "implement") {
    return `
      <p>${escapeHtml(artifact.summary || "Implementation details are available.")}</p>
      ${renderInlineTags(artifact.suggestedFiles || [])}
      ${renderList("Deliverables", artifact.deliverables || [])}
    `;
  }

  if (stage === "review") {
    const findings = (artifact.confirmedFindings || []).map((finding) => {
      return `${finding.severity}: ${finding.title}`;
    });
    return `
      ${renderList("Findings", findings)}
      ${renderList("Recommendations", artifact.recommendations || [])}
    `;
  }

  return `
    <p>Status: <strong>${escapeHtml(artifact.status || "ready")}</strong></p>
    ${renderList("Checks", artifact.checks || [])}
    ${renderInlineTags(artifact.suggestedCommands || [])}
  `;
}

function renderList(title, items) {
  if (!items.length) {
    return `<p><strong>${escapeHtml(title)}:</strong> none</p>`;
  }

  return `
    <p><strong>${escapeHtml(title)}</strong></p>
    <ul>${items.map((item) => `<li>${escapeHtml(String(item))}</li>`).join("")}</ul>
  `;
}

function renderInlineTags(items) {
  if (!items.length) {
    return "";
  }

  return `<div>${items
    .map((item) => `<span class="code-pill">${escapeHtml(String(item))}</span>`)
    .join("")}</div>`;
}

function summarizeTask(task) {
  if (task.summary) {
    return task.summary;
  }

  const parts = [];
  if (task.plan?.steps?.length) {
    parts.push(`${task.plan.steps.length} plan steps`);
  }
  if (task.review?.confirmedFindings?.length) {
    parts.push(`${task.review.confirmedFindings.length} findings`);
  }
  if (task.test?.status) {
    parts.push(`test ${task.test.status}`);
  }
  return parts.length ? parts.join(" • ") : "No summary yet.";
}

function stageTitle(stage) {
  return {
    plan: "Planner",
    implement: "Implementer",
    review: "Reviewer",
    test: "Tester",
  }[stage];
}

function parseConstraints(input) {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatDateTime(value) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    ...init,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }

  return response.json();
}

function setTaskFormBusy(busy) {
  refs.taskForm.querySelectorAll("button, textarea, input").forEach((element) => {
    element.disabled = busy;
  });
}

function setTaskButtonsBusy(busy) {
  refs.rerunButton.disabled = busy;
  refs.reviewButton.disabled = busy;
  refs.cancelButton.disabled = busy;
}

function setConfigBusy(busy) {
  refs.configForm.querySelectorAll("button, input, select").forEach((element) => {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLButtonElement)) {
      return;
    }

    if (
      !element.name ||
      !state.config?.lockedKeys.includes(element.name)
    ) {
      element.disabled = busy;
      return;
    }

    if (!busy) {
      element.disabled = true;
    }
  });
}

function showToast(message, tone = "success", duration = 3200) {
  refs.toast.textContent = message;
  refs.toast.className = `toast ${tone}`;
  refs.toast.classList.remove("hidden");

  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    refs.toast.classList.add("hidden");
  }, duration);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
