import { core } from "./core-client.js";
import { toPresentonCreateRequest } from "./academic-adapter.js";

const app = document.querySelector("#app");

const state = {
  step: "start",
  prompt: "",
  file: null,
  level: "Ensino secundário",
  type: "Apresentação de aula",
  slides: "10",
  duration: "10 minutos",
  language: "Português",
  activeSlide: 0,
  toast: "",
  presentationId: null,
  presentation: null,
  outlines: [],
  activeOutline: 0,
  templates: [],
  templatesLoading: false,
  templateId: null,
  pages: [],
  previewError: "",
  phase: "",
  generatedSlides: {},
  assetReadySlides: {},
  activeGeneratedSlide: 0,
  followNewSlides: true,
  editingOutlineIndex: null,
  editorTab: "text",
  editorDrafts: {},
  aiDrafts: {},
  newSlideTopic: "",
  exportingFormat: null,
  pendingAction: "",
  busy: false,
};

const examples = [
  "A Revolução Industrial para uma aula do secundário",
  "Defesa do meu trabalho de pesquisa em 8 minutos",
  "As alterações climáticas e o seu impacto em Moçambique",
];

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function plainOutlineLines(content) {
  return String(content || "").replace(/\r/g, "").split("\n").map((line) =>
    line.replace(/^\s{0,3}#{1,6}\s+/, "")
      .replace(/^\s*[-*+]\s+/, "• ")
      .replace(/!?\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\*\*|__|~~|`|\*|_/g, "")
      .trim()
  );
}

function outlineDisplay(content) {
  const lines = plainOutlineLines(content);
  const first = lines.findIndex((line) => line.length > 0);
  if (first < 0) return { title: "Slide sem texto", body: "" };
  return {
    title: lines[first],
    body: lines.slice(first + 1).join("\n").trim(),
  };
}

function slideTextSummary(slide) {
  const values = [];
  const visit = (value, key = "") => {
    if (values.length >= 12) return;
    if (typeof value === "string" && value.trim() && !/url|prompt|query|note|icon/i.test(key)) values.push(value.trim());
    else if (Array.isArray(value)) value.forEach((item) => visit(item, key));
    else if (value && typeof value === "object") Object.entries(value).forEach(([name, item]) => visit(item, name));
  };
  visit(slide.content);
  return values.map((value) => plainOutlineLines(value).join(" ")).filter(Boolean).slice(0, 2).join(" · ");
}

function icon(name, size = 20) {
  const paths = {
    arrow: '<path d="M4 10h12m-5-5 5 5-5 5"/>',
    back: '<path d="M16 10H4m5-5-5 5 5 5"/>',
    plus: '<path d="M10 3v14M3 10h14"/>',
    close: '<path d="M4 4l12 12M16 4 4 16"/>',
    file: '<path d="M5 2h7l4 4v12H5zM12 2v4h4M8 10h5M8 13h5"/>',
    upload: '<path d="M10 13V3m-4 4 4-4 4 4M3 13v4h14v-4"/>',
    spark: '<path d="m10 2 1.8 5.2L17 9l-5.2 1.8L10 16l-1.8-5.2L3 9l5.2-1.8L10 2ZM16 14l.7 1.3L18 16l-1.3.7L16 18l-.7-1.3L14 16l1.3-.7L16 14Z"/>',
    check: '<path d="m3 10 5 5 9-10"/>',
    down: '<path d="m5 8 5 5 5-5"/>',
    edit: '<path d="m3 14-.5 3.5L6 17l10-10-3-3L3 14ZM11 6l3 3"/>',
    trash: '<path d="M3 5h14M7 5V3h6v2m3 0-1 12H5L4 5m4 3v6m4-6v6"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

function brand() {
  return `<a class="brand" href="/" aria-label="Dume, início"><span class="brand-mark"><span></span><span></span><span></span><span></span></span><span>dume<span class="brand-dot">.</span></span></a>`;
}

function shell(content, active) {
  const steps = ["Pedido", "Opções", "Plano", "Slides"];
  return `<div class="site-shell">
    <header class="site-header">${brand()}<div class="header-right"><span class="header-label">Apresentações para estudantes</span></div></header>
    <div class="stepper" aria-label="Etapas da criação">${steps.map((label, index) => `<span class="step ${index <= active ? "is-active" : ""}"><span class="step-number">${index < active ? icon("check", 13) : index + 1}</span>${label}</span>${index < steps.length - 1 ? '<span class="step-line"></span>' : ""}`).join("")}</div>
    ${content}
    <footer class="site-footer"><span>Dume · apresentações para estudantes</span><span>Criação e edição de apresentações</span></footer>
    ${state.toast ? `<div class="toast" role="status">${escapeHtml(state.toast)}</div>` : ""}
  </div>`;
}

function fileCard() {
  if (!state.file) return "";
  const file = state.file;
  const size = file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / 1024 / 1024).toFixed(1)} MB`;
  return `<div class="attached-file"><span class="file-icon">${icon("file", 22)}</span><span class="file-info"><strong>${escapeHtml(file.name)}</strong><small>${escapeHtml(file.name.split(".").pop().toUpperCase())} · ${size}</small></span><button class="icon-button" type="button" id="remove-file" aria-label="Remover ficheiro">${icon("close", 16)}</button></div>`;
}

function renderStart() {
  app.innerHTML = shell(`<main class="home-main">
    <div class="hero-copy"><div class="eyebrow"><span class="eyebrow-line"></span> CRIAÇÃO DE APRESENTAÇÕES</div><h1>Da tua ideia<br /><em>aos slides.</em></h1><p>Escreve o tema ou adiciona um documento para começar.</p></div>
    <div class="composer-wrap"><div class="composer-glow"></div><section class="composer" aria-label="Criar apresentação"><div class="composer-heading"><span class="composer-symbol" aria-hidden="true"></span><span>O que queres apresentar?</span></div><label class="sr-only" for="prompt">Tema ou instrução</label><textarea id="prompt" placeholder="Ex.: Cria uma apresentação sobre a Guerra Fria para uma turma do 12.º ano...">${escapeHtml(state.prompt)}</textarea>${fileCard()}<div id="drop-zone" class="drop-zone"><button id="choose-file" class="attach-button" type="button">${icon("plus", 17)} Adicionar ficheiro</button><span>ou arrasta para aqui um PDF, DOCX ou TXT</span><input id="file-input" type="file" accept=".pdf,.doc,.docx,.txt,.md" hidden /></div><div class="composer-bottom"><span>Ideia, documento ou os dois juntos</span><button id="continue" class="primary-button" type="button">Continuar ${icon("arrow", 19)}</button></div></section></div>
    <div class="inspiration"><span>Exemplos de pedidos</span><div class="example-list">${examples.map((example, index) => `<button class="example-chip" data-example="${index}" type="button">${escapeHtml(example)} ${icon("arrow", 15)}</button>`).join("")}</div></div>
  </main>`, 0);
  document.querySelector("#prompt").addEventListener("input", (event) => { state.prompt = event.target.value; });
  document.querySelector("#choose-file").addEventListener("click", () => document.querySelector("#file-input").click());
  document.querySelector("#file-input").addEventListener("change", (event) => selectFile(event.target.files?.[0]));
  document.querySelector("#remove-file")?.addEventListener("click", () => { state.file = null; render(); });
  const drop = document.querySelector("#drop-zone");
  drop.addEventListener("dragover", (event) => { event.preventDefault(); drop.classList.add("is-dragging"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("is-dragging"));
  drop.addEventListener("drop", (event) => { event.preventDefault(); drop.classList.remove("is-dragging"); selectFile(event.dataTransfer.files?.[0]); });
  document.querySelector("#continue").addEventListener("click", () => {
    if (!state.prompt.trim() && !state.file) return showToast("Escreve um tema ou adiciona um ficheiro para continuar.");
    state.step = "settings";
    render();
  });
  document.querySelectorAll("[data-example]").forEach((button) => button.addEventListener("click", () => {
    state.prompt = examples[Number(button.dataset.example)];
    document.querySelector("#prompt").value = state.prompt;
    document.querySelector("#prompt").focus();
  }));
}

function selectFile(file) {
  if (!file) return;
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!["pdf", "doc", "docx", "txt", "md"].includes(extension)) return showToast("Escolhe um ficheiro PDF, DOCX, DOC, TXT ou Markdown.");
  if (!file.size || file.size > 100 * 1024 * 1024) return showToast("O ficheiro deve ter conteúdo e até 100 MB.");
  state.file = file;
  render();
}

function select(name, values) {
  return `<label class="field"><span>${name}</span><span class="select-wrap"><select data-setting="${name}">${values.map((value) => `<option ${state[{ "Nível de ensino": "level", "Tipo de apresentação": "type", "Número de slides": "slides", "Tempo para apresentar": "duration", "Idioma": "language" }[name]] === value ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}</select>${icon("down", 17)}</span></label>`;
}

function renderSettings() {
  const counts = ["Automático", "6", "8", "10", "12", "15"];
  app.innerHTML = shell(`<main class="settings-main settings-focused"><button class="text-back" id="back" type="button">${icon("back", 17)} Voltar ao pedido</button><div class="settings-focused-header"><div class="eyebrow"><span class="eyebrow-line"></span> OPÇÕES</div><h1>Define o essencial.</h1><p>Podes ajustar a estrutura antes de gerar os slides.</p></div><section class="settings-card settings-card-focused"><div class="settings-source"><span>O TEU PEDIDO</span><p>${escapeHtml(state.prompt.trim() || "Criar apresentação a partir do documento.")}</p>${state.file ? `<small>${icon("file", 15)} ${escapeHtml(state.file.name)}</small>` : ""}</div><fieldset class="slide-count-choice"><legend>Quantos slides precisas?</legend><div class="count-options">${counts.map((count) => `<button data-slide-choice="${count}" type="button" class="${state.slides === count ? "is-selected" : ""}" aria-pressed="${state.slides === count}">${count}</button>`).join("")}</div></fieldset><div class="settings-grid settings-grid-focused">${select("Nível de ensino", ["Ensino secundário", "Licenciatura", "Mestrado", "Outro"])}${select("Tipo de apresentação", ["Apresentação de aula", "Trabalho de pesquisa", "Defesa de trabalho", "Seminário", "Resumo"])}${select("Idioma", ["Português", "English", "Español", "Français"])}${select("Tempo para apresentar", ["Sem preferência", "5 minutos", "10 minutos", "15 minutos", "20 minutos"])}</div><div class="settings-style"><label class="field"><span>Estilo visual</span><span class="select-wrap"><select id="template-select" ${state.templates.length ? "" : "disabled"}>${state.templates.length ? state.templates.map((template) => `<option value="${escapeHtml(template.id)}" ${template.id === state.templateId ? "selected" : ""}>${escapeHtml(template.name)}</option>`).join("") : "<option>A carregar estilos…</option>"}</select>${icon("down", 17)}</span></label><p>Escolhe um estilo para os slides. Poderás rever o texto no passo seguinte.</p></div><div class="settings-action"><span>Próximo passo: rever o plano dos slides</span><button id="preview" class="primary-button" type="button">Criar plano ${icon("arrow", 19)}</button></div></section></main>`, 1);
  document.querySelector("#back").addEventListener("click", () => { state.step = "start"; render(); });
  document.querySelectorAll("[data-setting]").forEach((element) => element.addEventListener("change", (event) => {
    const key = { "Nível de ensino": "level", "Tipo de apresentação": "type", "Número de slides": "slides", "Tempo para apresentar": "duration", "Idioma": "language" }[event.target.dataset.setting];
    state[key] = event.target.value;
  }));
  document.querySelectorAll("[data-slide-choice]").forEach((button) => button.addEventListener("click", () => {
    state.slides = button.dataset.slideChoice;
    document.querySelectorAll("[data-slide-choice]").forEach((choice) => {
      const selected = choice === button;
      choice.classList.toggle("is-selected", selected);
      choice.setAttribute("aria-pressed", String(selected));
    });
  }));
  document.querySelector("#template-select")?.addEventListener("change", (event) => { state.templateId = event.target.value; });
  document.querySelector("#preview").addEventListener("click", runOutline);
  if (!state.templates.length && !state.templatesLoading) ensureTemplates();
}

function showToast(message) {
  state.toast = message;
  document.querySelector(".toast")?.remove();
  const element = document.createElement("div");
  element.className = "toast";
  element.setAttribute("role", "status");
  element.textContent = message;
  document.querySelector(".site-shell").append(element);
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => { state.toast = ""; document.querySelector(".toast")?.remove(); }, 4000);
}

async function ensureTemplates() {
  if (state.templates.length || state.templatesLoading) return;
  state.templatesLoading = true;
  try {
    state.templates = await core.templates();
    if (!state.templates.length) throw new Error("Não há estilos disponíveis no motor.");
    state.templateId = state.templateId || state.templates.find((template) => template.name?.toLowerCase() === "general")?.id || state.templates.find((template) => template.is_default)?.id || state.templates[0].id;
    if (state.step === "settings") renderSettings();
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Não foi possível carregar os estilos.");
  } finally {
    state.templatesLoading = false;
  }
}

function renderGeneratedCarousel(written, total) {
  const selected = written.some(([index]) => Number(index) === state.activeGeneratedSlide)
    ? state.activeGeneratedSlide
    : Number(written.at(-1)?.[0] || 0);
  state.activeGeneratedSlide = selected;
  const cards = written.map(([index, slide]) => {
    const position = Number(index);
    const title = outlineDisplay(state.outlines[position]?.content).title;
    const summary = slideTextSummary(slide);
    const assetStatus = state.assetReadySlides[position];
    const status = assetStatus === "warning" ? "Slide pronto; algumas imagens indisponíveis" : assetStatus === "ready" ? "Elementos visuais processados" : "Conteúdo pronto";
    const distance = Math.abs(position - selected);
    return `<button class="live-slide ${distance === 0 ? "is-active" : distance === 1 ? "is-blurred" : "is-far"}" data-generated-slide="${position}" type="button" aria-label="Ver texto do slide ${position + 1}"><span class="live-slide-top"><span class="live-slide-number">${String(position + 1).padStart(2, "0")}</span><strong>${escapeHtml(title)}</strong></span><span class="live-slide-meta">${escapeHtml(summary || "O conteúdo deste slide está pronto.")}</span><span class="live-slide-status"><i class="live-status-dot ${assetStatus === "warning" ? "has-warning" : ""}"></i>${status}</span></button>`;
  }).join("");
  const note = written.length < total ? "Os próximos slides aparecem aqui à medida que ficam prontos." : Object.keys(state.assetReadySlides).length < total ? "A finalizar os elementos visuais dos slides." : "Texto e elementos visuais processados.";
  return `<section class="live-slides" aria-label="Slides escritos em tempo real"><div class="live-slides-heading"><h2>Texto dos slides</h2><span id="generated-counter">${written.length ? `${selected + 1} de ${total}` : `0 de ${total}`}</span></div><div class="generation-carousel-stage"><div class="generation-carousel-fade is-left" aria-hidden="true"></div><div class="generation-carousel-track" id="generated-track">${cards || '<div class="generation-carousel-empty"><span class="live-pulse"></span>A escrever o primeiro slide…</div>'}</div><div class="generation-carousel-fade is-right" aria-hidden="true"></div></div><div class="generation-carousel-controls"><button id="generated-prev" class="generation-carousel-nav" type="button" aria-label="Slide anterior" ${written.length < 2 || selected === Number(written[0][0]) ? "disabled" : ""}>${icon("back", 17)}</button><div class="generation-carousel-dots" aria-label="Navegar pelos slides escritos">${written.map(([index]) => `<button class="generation-carousel-dot ${Number(index) === selected ? "is-active" : ""}" data-generated-dot="${index}" type="button" aria-label="Ir para o slide ${Number(index) + 1}" aria-current="${Number(index) === selected ? "true" : "false"}"></button>`).join("")}</div><button id="generated-next" class="generation-carousel-nav" type="button" aria-label="Próximo slide" ${written.length < 2 || selected === Number(written.at(-1)[0]) ? "disabled" : ""}>${icon("arrow", 17)}</button></div><p class="generation-carousel-note" aria-live="polite">${note}</p></section>`;
}

function bindGeneratedCarousel() {
  const track = document.querySelector("#generated-track");
  const cards = [...(track?.querySelectorAll("[data-generated-slide]") || [])];
  if (!track || !cards.length) return;
  const indices = cards.map((card) => Number(card.dataset.generatedSlide));
  const setFocus = (index) => {
    state.activeGeneratedSlide = index;
    cards.forEach((card) => {
      const distance = Math.abs(Number(card.dataset.generatedSlide) - index);
      card.classList.toggle("is-active", distance === 0);
      card.classList.toggle("is-blurred", distance === 1);
      card.classList.toggle("is-far", distance > 1);
    });
    document.querySelector("#generated-counter").textContent = `${index + 1} de ${state.outlines.length}`;
    document.querySelectorAll("[data-generated-dot]").forEach((dot) => {
      const active = Number(dot.dataset.generatedDot) === index;
      dot.classList.toggle("is-active", active);
      dot.setAttribute("aria-current", String(active));
    });
    document.querySelector("#generated-prev").disabled = index === indices[0];
    document.querySelector("#generated-next").disabled = index === indices.at(-1);
  };
  const goTo = (index, behavior = "smooth") => {
    const card = cards.find((item) => Number(item.dataset.generatedSlide) === index);
    if (!card) return;
    setFocus(index);
    track.scrollTo({ left: card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2, behavior });
  };
  cards.forEach((card) => card.addEventListener("click", () => { state.followNewSlides = false; goTo(Number(card.dataset.generatedSlide)); }));
  document.querySelectorAll("[data-generated-dot]").forEach((dot) => dot.addEventListener("click", () => { state.followNewSlides = false; goTo(Number(dot.dataset.generatedDot)); }));
  document.querySelector("#generated-prev").addEventListener("click", () => { state.followNewSlides = false; goTo(indices[Math.max(0, indices.indexOf(state.activeGeneratedSlide) - 1)]); });
  document.querySelector("#generated-next").addEventListener("click", () => { state.followNewSlides = false; goTo(indices[Math.min(indices.length - 1, indices.indexOf(state.activeGeneratedSlide) + 1)]); });
  let scrollFrame = 0;
  track.addEventListener("scroll", () => {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(() => {
      const center = track.getBoundingClientRect().left + track.clientWidth / 2;
      const closest = cards.reduce((best, card) => Math.abs(card.getBoundingClientRect().left + card.offsetWidth / 2 - center) < Math.abs(best.getBoundingClientRect().left + best.offsetWidth / 2 - center) ? card : best);
      setFocus(Number(closest.dataset.generatedSlide));
    });
  });
  track.addEventListener("pointerdown", () => { state.followNewSlides = false; });
  track.addEventListener("wheel", () => { state.followNewSlides = false; }, { passive: true });
  requestAnimationFrame(() => {
    const card = cards.find((item) => Number(item.dataset.generatedSlide) === state.activeGeneratedSlide);
    if (!card) return;
    track.style.scrollBehavior = "auto";
    track.scrollLeft = card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2;
    setFocus(Number(card.dataset.generatedSlide));
    requestAnimationFrame(() => { track.style.scrollBehavior = ""; });
  });
}

function renderGenerating() {
  const stages = [
    ["upload", "A carregar o documento"],
    ["create", "A guardar o pedido"],
    ["outline", "A criar a estrutura"],
    ["prepare", "A preparar os slides"],
    ["slides", "A escrever os slides"],
    ["preview", "A preparar a prévia"],
  ].filter(([key]) => key !== "upload" || state.file);
  const active = stages.findIndex(([key]) => key === state.phase);
  const total = state.outlines.length;
  const written = Object.entries(state.generatedSlides).sort(([left], [right]) => Number(left) - Number(right));
  const liveSlides = state.phase === "slides" && total ? renderGeneratedCarousel(written, total) : "";
  app.innerHTML = shell(`<main class="generation-main"><div class="eyebrow"><span class="eyebrow-line"></span> A PREPARAR APRESENTAÇÃO</div><h1>A criar os<br /><em>teus slides.</em></h1><p>O plano está pronto. Os slides aparecem abaixo à medida que o texto fica concluído.</p><div class="generation-card" role="status" aria-live="polite">${stages.map(([key, label], index) => `<div class="generation-stage ${index < active ? "is-done" : ""} ${index === active ? "is-current" : ""}"><span class="generation-icon">${index < active ? icon("check", 16) : String(index + 1).padStart(2, "0")}</span><span>${key === "slides" && index === active && written.length === total ? "A finalizar os slides" : label}${key === "slides" && index === active ? ` · ${written.length}/${total}` : ""}</span></div>`).join("")}</div>${liveSlides}</main>`, ["upload", "create", "outline"].includes(state.phase) ? 1 : 2);
  if (state.phase === "slides") bindGeneratedCarousel();
}

async function runOutline() {
  if (state.busy) return;
  state.busy = true;
  state.step = "generating";
  state.phase = state.file ? "upload" : "create";
  render();
  try {
    if (!state.templates.length) await ensureTemplates();
    if (!state.templateId) throw new Error("Escolhe um estilo visual para continuar.");
    const filePaths = state.file ? await core.upload(state.file) : [];
    state.phase = "create";
    renderGenerating();
    const created = await core.create(toPresentonCreateRequest(state, filePaths));
    state.presentationId = created.id;
    window.history.replaceState(null, "", `?id=${encodeURIComponent(created.id)}`);
    state.phase = "outline";
    renderGenerating();
    const outlined = await core.outline(created.id);
    state.outlines = outlined.outlines?.slides || [];
    if (!state.outlines.length) throw new Error("O motor não devolveu a estrutura dos slides.");
    state.activeOutline = 0;
    state.step = "outline";
    render();
  } catch (error) {
    state.step = "settings";
    render();
    showToast(error instanceof Error ? error.message : "Não foi possível criar a estrutura.");
  } finally {
    state.busy = false;
  }
}

function renderOutlineReview() {
  const rows = state.outlines.map((slide, index) => {
    const { title, body } = outlineDisplay(slide.content);
    const editing = state.editingOutlineIndex === index;
    const paragraphs = body.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
    return `<li class="outline-list-item" data-outline-row="${index}"><span class="outline-list-number">${String(index + 1).padStart(2, "0")}</span><div class="outline-list-copy">${editing ? `<label class="outline-edit-label" for="outline-edit-title">Título</label><input id="outline-edit-title" value="${escapeHtml(title)}" /><label class="outline-edit-label" for="outline-edit-body">Texto</label><textarea id="outline-edit-body">${escapeHtml(body)}</textarea>` : `<h2>${escapeHtml(title)}</h2><div class="outline-list-body">${paragraphs.length ? paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("") : '<p class="outline-empty">Ainda sem texto de apoio.</p>'}</div>`}</div><button class="outline-list-edit" data-outline-edit="${index}" type="button" aria-label="${editing ? "Concluir edição" : "Editar"} item ${index + 1}">${editing ? "Concluir" : `${icon("edit", 15)} Editar`}</button></li>`;
  }).join("");
  app.innerHTML = shell(`<main class="outline-main"><button id="outline-back" class="text-back" type="button">${icon("back", 17)} Voltar aos detalhes</button><div class="outline-header"><div><div class="eyebrow"><span class="eyebrow-line"></span> PLANO DA APRESENTAÇÃO</div><h1>Revê a estrutura.</h1><p>Lê o texto de cada parte e ajusta o que precisares antes de criar os slides.</p></div><button id="generate-slides" class="primary-button" type="button">Gerar apresentação ${icon("arrow", 18)}</button></div><section class="outline-list-card" aria-label="Plano da apresentação"><div class="outline-list-heading"><strong>Estrutura</strong><span>${state.outlines.length} partes</span></div><ol class="outline-list">${rows}</ol></section></main>`, 2);
  document.querySelector("#outline-back").addEventListener("click", () => { state.step = "settings"; render(); });
  document.querySelectorAll("[data-outline-edit]").forEach((button) => button.addEventListener("click", () => {
    const index = Number(button.dataset.outlineEdit);
    state.editingOutlineIndex = state.editingOutlineIndex === index ? null : index;
    renderOutlineReview();
    document.querySelector(`[data-outline-row="${index}"]`)?.scrollIntoView({ block: "nearest" });
    document.querySelector("#outline-edit-title")?.focus();
  }));
  if (state.editingOutlineIndex !== null) {
    const index = state.editingOutlineIndex;
    const titleInput = document.querySelector("#outline-edit-title");
    const bodyInput = document.querySelector("#outline-edit-body");
    const resize = () => { bodyInput.style.height = "auto"; bodyInput.style.height = `${Math.max(260, bodyInput.scrollHeight + 2)}px`; };
    const update = () => { state.outlines[index].content = `${titleInput.value.trim()}\n\n${bodyInput.value.trim()}`.trim(); resize(); };
    titleInput.addEventListener("input", update);
    bodyInput.addEventListener("input", update);
    resize();
  }
  document.querySelector("#generate-slides").addEventListener("click", runSlides);
}

async function refreshPreview(force = true) {
  try {
    const result = await core.preview(state.presentationId, force);
    state.pages = result.pages;
    state.previewVersion = (state.previewVersion || 0) + 1;
    state.previewError = "";
  } catch (error) {
    state.pages = [];
    state.previewError = error instanceof Error ? error.message : "Não foi possível preparar a prévia.";
  }
}

async function runSlides() {
  if (state.busy) return;
  if (!state.outlines.length || state.outlines.some((slide) => !slide.content.trim())) return showToast("Todos os slides precisam de conteúdo no plano.");
  state.busy = true;
  state.step = "generating";
  state.phase = "prepare";
  state.generatedSlides = {};
  state.assetReadySlides = {};
  state.activeGeneratedSlide = 0;
  state.followNewSlides = true;
  state.editingOutlineIndex = null;
  render();
  try {
    await core.saveOutline(state.presentationId, state.outlines);
    await core.prepare(state.presentationId, state.outlines, state.templateId);
    state.phase = "slides";
    renderGenerating();
    await core.generate(state.presentationId, (event) => {
      if (event.type === "chunk" && event.chunk?.trimStart().startsWith("{")) {
        let slide;
        try { slide = JSON.parse(event.chunk); } catch { return; }
        if (Number.isInteger(slide.index) && slide.content) {
          state.generatedSlides[slide.index] = slide;
          if (state.followNewSlides) state.activeGeneratedSlide = slide.index;
          renderGenerating();
        }
      } else if (event.type === "slide_assets" && Number.isInteger(event.slide_index)) {
        state.assetReadySlides[event.slide_index] = event.warnings?.length ? "warning" : "ready";
        renderGenerating();
      }
    });
    state.presentation = await core.get(state.presentationId);
    state.phase = "preview";
    renderGenerating();
    await refreshPreview(true);
    state.activeSlide = 0;
    state.step = "real-preview";
    render();
  } catch (error) {
    state.step = "outline";
    render();
    showToast(error instanceof Error ? error.message : "Não foi possível gerar os slides.");
  } finally {
    state.busy = false;
    if (state.step === "real-preview") renderRealPreview();
  }
}

function orderedSlides() {
  return [...(state.presentation?.slides || [])].sort((a, b) => a.index - b.index);
}

function pageUrl(index) {
  const path = state.pages[index];
  return path ? `${path}?v=${state.previewVersion || 0}` : "";
}

function editableTextFields(content) {
  const fields = [];
  const visit = (value, path = []) => {
    if (typeof value === "string") {
      if (!value.trim() || path.some((part) => typeof part === "string" && (part.startsWith("__") || /_(url|prompt|query|initials)$/.test(part)))) return;
      const key = String(path.at(-1) || "");
      const label = /heading|headline|title/i.test(key) ? "Título" : /attribution_name|author_name/i.test(key) ? "Autor" : /attribution_detail|subtitle/i.test(key) ? "Detalhes" : /paragraph|body|description|copy|text/i.test(key) ? "Texto" : "Texto adicional";
      fields.push({ path, label, value });
      return;
    }
    if (Array.isArray(value)) value.forEach((item, index) => visit(item, [...path, index]));
    else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => visit(item, [...path, key]));
  };
  visit(content);
  return fields.slice(0, 24);
}

function renderRealPreview() {
  const slides = orderedSlides();
  if (!slides.length) return renderOutlineReview();
  state.activeSlide = Math.min(state.activeSlide, slides.length - 1);
  const selected = slides[state.activeSlide];
  const textFields = editableTextFields(selected.content);
  const image = pageUrl(state.activeSlide);
  const title = String(state.presentation.title || "Apresentação").replace(/\s+/g, " ").trim();
  const displayTitle = title.length > 100 ? `${title.slice(0, 99)}…` : title;
  const textPanel = `<div class="editor-panel-intro"><h2>Editar texto</h2><p>Altera os campos do slide e guarda cada mudança.</p></div><div class="direct-text-section">${textFields.length ? textFields.map((field, index) => {
    const value = state.editorDrafts[selected.id]?.[index] ?? field.value;
    return `<div class="direct-text-field"><label class="field"><span>${escapeHtml(field.label)}</span><textarea data-text-field="${index}" ${state.busy ? "disabled" : ""}>${escapeHtml(value)}</textarea></label><button data-save-text="${index}" type="button" ${state.busy ? "disabled" : ""}>${state.pendingAction === `text:${index}` ? "A guardar…" : "Guardar alteração"}</button></div>`;
  }).join("") : '<p class="editor-panel-empty">Não há campos de texto neste slide. Podes pedir uma mudança em “Alterar”.</p>'}</div>`;
  const aiPanel = `<div class="editor-panel-intro"><h2>Pedir uma alteração</h2><p>Descreve o que queres mudar neste slide.</p></div><div class="regenerate-section"><label class="field"><span>Instrução para este slide</span><textarea id="slide-instruction" ${state.busy ? "disabled" : ""} placeholder="Ex.: Resume o texto e acrescenta um exemplo concreto.">${escapeHtml(state.aiDrafts[selected.id] || "")}</textarea></label><button id="regenerate-slide" class="primary-button panel-primary" type="button" ${state.busy ? "disabled" : ""}>${state.busy ? "A atualizar…" : "Aplicar alteração"}</button></div>`;
  const slidesPanel = `<div class="editor-panel-intro"><h2>Organizar slides</h2><p>Move, duplica ou acrescenta um slide.</p></div><div class="slide-structure-actions"><button data-structure="up" type="button" ${state.activeSlide === 0 || state.busy ? "disabled" : ""}>${icon("back", 15)} Subir</button><button data-structure="down" type="button" ${state.activeSlide === slides.length - 1 || state.busy ? "disabled" : ""}>Descer ${icon("arrow", 15)}</button><button data-structure="duplicate" type="button" ${slides.length >= 50 || state.busy ? "disabled" : ""}>Duplicar slide</button><button data-structure="delete" class="danger-action" type="button" ${slides.length === 1 || state.busy ? "disabled" : ""}>Remover slide</button></div><div class="add-real-slide"><label class="field"><span>Assunto do novo slide</span><input id="new-slide-topic" ${state.busy ? "disabled" : ""} value="${escapeHtml(state.newSlideTopic)}" placeholder="Ex.: exemplos práticos" /></label><button id="add-real-slide" class="outline-button" type="button" ${state.busy || slides.length >= 50 ? "disabled" : ""}>${icon("plus", 15)} Adicionar slide</button></div>`;
  const panel = state.editorTab === "ai" ? aiPanel : state.editorTab === "slides" ? slidesPanel : textPanel;
  app.innerHTML = shell(`<main class="preview-main"><div class="preview-top"><div><div class="eyebrow"><span class="eyebrow-line"></span> APRESENTAÇÃO</div><h1>Os teus slides.</h1><p>${escapeHtml(displayTitle)} · ${slides.length} slides</p></div><div class="export-actions"><button data-export="pdf" class="outline-button" type="button" ${state.busy ? "disabled" : ""}>${state.exportingFormat === "pdf" ? "A preparar PDF…" : "Descarregar PDF"}</button><button data-export="pptx" class="primary-button" type="button" ${state.busy ? "disabled" : ""}>${state.exportingFormat === "pptx" ? "A preparar PPTX…" : "Descarregar PPTX"} ${icon("arrow", 16)}</button></div></div><div class="editor-shell real-editor"><aside class="slide-rail"><div class="rail-top"><strong>Slides</strong><span>${slides.length}</span></div><div class="slide-list">${slides.map((slide, index) => `<button class="slide-thumb ${index === state.activeSlide ? "is-selected" : ""}" data-real-slide="${index}" type="button" ${state.busy ? "disabled" : ""}><span class="thumb-index">${String(index + 1).padStart(2, "0")}</span><span class="thumb-paper">${pageUrl(index) ? `<img src="${pageUrl(index)}" alt="Slide ${index + 1}" />` : `<strong>Slide ${index + 1}</strong>`}</span></button>`).join("")}</div></aside><div class="editor-center"><div class="canvas-toolbar"><span>Slide ${state.activeSlide + 1} de ${slides.length}</span><span>${state.busy ? escapeHtml(state.pendingAction || "A atualizar…") : "Prévia"}</span></div>${image ? `<div class="real-slide-frame"><img src="${image}" alt="Slide ${state.activeSlide + 1} da apresentação" /></div>` : `<div class="preview-unavailable"><strong>Prévia indisponível</strong><p>${escapeHtml(state.previewError || "A prévia ainda não ficou pronta.")}</p><button id="retry-preview" class="outline-button" type="button">Tentar novamente</button></div>`}<div class="editor-slide-nav"><button id="slide-prev" type="button" ${state.activeSlide === 0 || state.busy ? "disabled" : ""}>${icon("back", 15)} Anterior</button><button id="slide-next" type="button" ${state.activeSlide === slides.length - 1 || state.busy ? "disabled" : ""}>Seguinte ${icon("arrow", 15)}</button></div></div><aside class="edit-panel"><div class="panel-header"><strong>Ferramentas</strong><span>SLIDE ${String(state.activeSlide + 1).padStart(2, "0")}</span></div><div class="editor-tabs" role="tablist" aria-label="Ferramentas do slide">${[["text", "Texto"], ["ai", "Alterar"], ["slides", "Organizar"]].map(([key, label]) => `<button data-editor-tab="${key}" role="tab" aria-selected="${state.editorTab === key}" class="${state.editorTab === key ? "is-active" : ""}" type="button" ${state.busy ? "disabled" : ""}>${label}</button>`).join("")}</div><div class="editor-panel-body">${panel}</div></aside></div></main>`, 3);
  document.querySelectorAll("[data-real-slide]").forEach((button) => button.addEventListener("click", () => { state.activeSlide = Number(button.dataset.realSlide); renderRealPreview(); }));
  document.querySelector("#slide-prev").addEventListener("click", () => { state.activeSlide -= 1; renderRealPreview(); });
  document.querySelector("#slide-next").addEventListener("click", () => { state.activeSlide += 1; renderRealPreview(); });
  document.querySelectorAll("[data-editor-tab]").forEach((button) => button.addEventListener("click", () => { state.editorTab = button.dataset.editorTab; renderRealPreview(); }));
  document.querySelectorAll("[data-text-field]").forEach((input) => {
    const resize = () => { input.style.height = "auto"; input.style.height = `${Math.max(84, input.scrollHeight + 2)}px`; };
    input.addEventListener("input", () => { (state.editorDrafts[selected.id] ||= {})[Number(input.dataset.textField)] = input.value; resize(); });
    resize();
  });
  document.querySelectorAll("[data-save-text]").forEach((button) => button.addEventListener("click", () => saveTextField(Number(button.dataset.saveText))));
  document.querySelector("#slide-instruction")?.addEventListener("input", (event) => { state.aiDrafts[selected.id] = event.target.value; });
  document.querySelector("#regenerate-slide")?.addEventListener("click", regenerateCurrentSlide);
  document.querySelector("#new-slide-topic")?.addEventListener("input", (event) => { state.newSlideTopic = event.target.value; });
  document.querySelectorAll("[data-structure]").forEach((button) => button.addEventListener("click", () => changeStructure(button.dataset.structure)));
  document.querySelector("#add-real-slide")?.addEventListener("click", () => changeStructure("add"));
  document.querySelector("#retry-preview")?.addEventListener("click", async () => { await refreshPreview(true); renderRealPreview(); });
  document.querySelectorAll("[data-export]").forEach((button) => button.addEventListener("click", () => downloadDeck(button.dataset.export)));
}

async function saveTextField(index) {
  if (state.busy) return;
  const selected = orderedSlides()[state.activeSlide];
  const field = editableTextFields(selected.content)[index];
  const input = document.querySelector(`[data-text-field="${index}"]`);
  if (!field || !input) return;
  const value = input.value;
  if (value === field.value) return showToast("Este texto já está guardado.");
  state.busy = true;
  state.pendingAction = `text:${index}`;
  renderRealPreview();
  try {
    await core.updateText(selected.id, field.path, value);
    delete state.editorDrafts[selected.id]?.[index];
    state.presentation = await core.get(state.presentationId);
    await refreshPreview(true);
    showToast("Texto guardado no slide.");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Não foi possível guardar o texto.");
  } finally {
    state.busy = false;
    state.pendingAction = "";
    renderRealPreview();
  }
}

async function regenerateCurrentSlide() {
  if (state.busy) return;
  const instruction = document.querySelector("#slide-instruction").value.trim();
  if (!instruction) return showToast("Escreve a alteração pretendida para este slide.");
  const selected = orderedSlides()[state.activeSlide];
  state.busy = true;
  state.pendingAction = "A atualizar o slide…";
  renderRealPreview();
  try {
    await core.regenerate(selected.id, instruction);
    delete state.aiDrafts[selected.id];
    state.presentation = await core.get(state.presentationId);
    await refreshPreview(true);
    renderRealPreview();
    showToast("Slide atualizado.");
  } catch (error) {
    renderRealPreview();
    showToast(error instanceof Error ? error.message : "Não foi possível atualizar o slide.");
  } finally { state.busy = false; state.pendingAction = ""; renderRealPreview(); }
}

async function changeStructure(action) {
  if (state.busy) return;
  const topic = action === "add" ? document.querySelector("#new-slide-topic").value.trim() : "";
  if (action === "add" && !topic) return showToast("Indica o assunto do novo slide.");
  const originalSlides = orderedSlides().map((slide) => structuredClone(slide));
  const slides = originalSlides.map((slide) => structuredClone(slide));
  const index = state.activeSlide;
  let nextActive = index;
  let addedId = null;
  if (action === "up" && index > 0) { [slides[index - 1], slides[index]] = [slides[index], slides[index - 1]]; nextActive -= 1; }
  else if (action === "down" && index < slides.length - 1) { [slides[index + 1], slides[index]] = [slides[index], slides[index + 1]]; nextActive += 1; }
  else if ((action === "duplicate" || action === "add") && slides.length < 50) {
    const copy = structuredClone(slides[index]);
    copy.id = crypto.randomUUID();
    copy.revision = 0;
    addedId = copy.id;
    slides.splice(index + 1, 0, copy);
    nextActive += 1;
  } else if (action === "delete" && slides.length > 1) {
    slides.splice(index, 1);
    nextActive = Math.min(index, slides.length - 1);
  } else return;
  slides.forEach((slide, slideIndex) => { slide.index = slideIndex; });
  state.busy = true;
  state.pendingAction = action === "add" ? "A criar o novo slide…" : "A organizar os slides…";
  renderRealPreview();
  let originalOutlines;
  let outlineSaved = false;
  let slidesSaved = false;
  try {
    originalOutlines = (await core.getOutline(state.presentationId)).slides;
    if (originalOutlines.length !== originalSlides.length) throw new Error("O plano e os slides estão dessincronizados. Reabre esta apresentação antes de editar a estrutura.");
    const outlines = originalOutlines.map((outline) => structuredClone(outline));
    if (action === "up") [outlines[index - 1], outlines[index]] = [outlines[index], outlines[index - 1]];
    else if (action === "down") [outlines[index + 1], outlines[index]] = [outlines[index], outlines[index + 1]];
    else if (action === "duplicate") outlines.splice(index + 1, 0, structuredClone(outlines[index]));
    else if (action === "add") outlines.splice(index + 1, 0, { content: topic });
    else if (action === "delete") outlines.splice(index, 1);
    await core.saveOutline(state.presentationId, outlines);
    outlineSaved = true;
    await core.updateSlides(state.presentationId, slides);
    slidesSaved = true;
    if (action === "add") await core.regenerate(addedId, `Cria um novo slide sobre ${topic}. Mantém a linguagem adequada a ${state.level.toLowerCase()} e evita repetir o slide anterior.`);
    if (action === "add") state.newSlideTopic = "";
    state.presentation = await core.get(state.presentationId);
    state.outlines = outlines;
    state.activeSlide = nextActive;
    await refreshPreview(true);
    showToast(action === "add" ? "Novo slide criado." : "Estrutura dos slides guardada.");
  } catch (error) {
    if (slidesSaved) await core.updateSlides(state.presentationId, originalSlides).catch(() => {});
    if (outlineSaved) await core.saveOutline(state.presentationId, originalOutlines).catch(() => {});
    state.presentation = await core.get(state.presentationId).catch(() => state.presentation);
    showToast(error instanceof Error ? error.message : "Não foi possível alterar os slides.");
  } finally { state.busy = false; state.pendingAction = ""; renderRealPreview(); }
}

async function downloadDeck(format) {
  if (state.busy) return;
  state.busy = true;
  state.exportingFormat = format;
  state.pendingAction = `A preparar ${format.toUpperCase()}…`;
  renderRealPreview();
  showToast(`A preparar o ficheiro ${format.toUpperCase()}…`);
  try {
    const blob = await core.download(state.presentationId, format);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `Dume-${state.presentationId}.${format}`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    showToast(`${format.toUpperCase()} pronto para descarregar.`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : "A exportação falhou.");
  } finally { state.busy = false; state.exportingFormat = null; state.pendingAction = ""; renderRealPreview(); }
}

function render() {
  if (state.step === "settings") renderSettings();
  else if (state.step === "generating") renderGenerating();
  else if (state.step === "outline") renderOutlineReview();
  else if (state.step === "real-preview") renderRealPreview();
  else renderStart();
  window.scrollTo(0, 0);
}

render();

window.addEventListener("keydown", (event) => {
  if (state.step !== "generating" || state.phase !== "slides" || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select")) return;
  const button = document.querySelector(event.key === "ArrowLeft" ? "#generated-prev" : "#generated-next");
  if (button && !button.disabled) { event.preventDefault(); button.click(); }
});

const savedId = new URLSearchParams(window.location.search).get("id");
if (savedId && /^[0-9a-f-]{36}$/i.test(savedId)) {
  (async () => {
    try {
      const presentation = await core.get(savedId);
      state.presentationId = savedId;
      state.presentation = presentation;
      if (presentation.slides?.length) {
        state.step = "generating";
        state.phase = "preview";
        render();
        await refreshPreview(false);
        state.step = "real-preview";
      } else {
        const outline = await core.getOutline(savedId);
        if (outline.slides?.length) {
          state.outlines = outline.slides;
          state.step = "outline";
          await ensureTemplates();
        }
      }
      render();
    } catch { /* A URL pode apontar para um deck removido; a home continua disponível. */ }
  })();
}
