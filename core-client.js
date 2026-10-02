const prefix = "/core/api/v1/ppt";

async function request(url, options) {
  try {
    return await fetch(url, options);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("Não foi possível contactar o motor de apresentações. Verifica se o servidor está disponível.");
    }
    throw error;
  }
}

async function responseError(response) {
  const value = await response.json().catch(() => ({}));
  const detail = value.detail || value.error || `Pedido falhou (HTTP ${response.status}).`;
  return new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
}

async function jsonRequest(path, options = {}) {
  const response = await request(`${prefix}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (!response.ok) throw await responseError(response);
  return response.json();
}

async function stream(path, onEvent) {
  const response = await request(`${prefix}${path}`, { headers: { Accept: "text/event-stream" } });
  if (!response.ok) throw await responseError(response);
  if (!response.body) throw new Error("O motor não devolveu o fluxo de geração.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed;
  const parseFrame = (frame) => {
    const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (!data) return;
    const message = JSON.parse(data);
    onEvent?.(message);
    if (message.type === "error") throw new Error(message.detail || "A geração foi interrompida.");
    if (message.type === "complete") completed = message.presentation;
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        parseFrame(frame);
      }
    }
    if (buffer.trim()) parseFrame(buffer);
  } finally {
    reader.releaseLock();
  }
  if (!completed) throw new Error("A geração terminou sem confirmação do motor.");
  return completed;
}

export const core = {
  async upload(file) {
    const body = new FormData();
    body.append("files", file);
    const response = await request(`${prefix}/files/upload`, { method: "POST", body });
    if (!response.ok) throw await responseError(response);
    return response.json();
  },
  create: (request) => jsonRequest("/presentation/create", { method: "POST", body: JSON.stringify(request) }),
  outline: (id, onEvent) => stream(`/outlines/stream/${encodeURIComponent(id)}`, onEvent),
  getOutline: (id) => jsonRequest(`/outlines/${encodeURIComponent(id)}`),
  saveOutline: (id, slides) => jsonRequest(`/outlines/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ slides }) }),
  templates: async () => (await jsonRequest("/template/all?page=1&page_size=100")).items,
  prepare: (id, outlines, layout) => jsonRequest("/presentation/prepare", { method: "POST", body: JSON.stringify({ presentation_id: id, outlines, layout }) }),
  generate: (id, onEvent) => stream(`/presentation/stream/${encodeURIComponent(id)}`, onEvent),
  get: (id) => jsonRequest(`/presentation/${encodeURIComponent(id)}`),
  regenerate: (id, prompt) => jsonRequest("/slide/edit", { method: "POST", body: JSON.stringify({ id, prompt }) }),
  updateText: (slideId, path, value) => jsonRequest("/presentation/slide/text", { method: "POST", body: JSON.stringify({ slide_id: slideId, path, value }) }),
  updateSlides: (id, slides) => jsonRequest("/presentation/update", { method: "PATCH", body: JSON.stringify({ id, n_slides: slides.length, slides }) }),
  async preview(id, refresh = false) {
    const response = await request(`/api/preview/${encodeURIComponent(id)}${refresh ? "?refresh=1" : ""}`);
    if (!response.ok) throw await responseError(response);
    return response.json();
  },
  async download(id, format) {
    const response = await request(`/api/download/${encodeURIComponent(id)}/${format}`);
    if (!response.ok) throw await responseError(response);
    return response.blob();
  },
};
