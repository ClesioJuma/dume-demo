const languages = {
  "Português": "Portuguese (Português)",
  English: "English",
  Español: "Spanish (Español)",
  Français: "French (Français)",
};

export function toPresentonCreateRequest(options, filePaths = []) {
  const instructions = [
    `Adequar o vocabulário e a profundidade ao nível de ${options.level.toLowerCase()}.`,
    `Estruturar como ${options.type.toLowerCase()}.`,
    options.duration !== "Sem preferência"
      ? `Preparar para uma apresentação oral de aproximadamente ${options.duration.toLowerCase()}.`
      : "",
  ].filter(Boolean).join("\n");

  return {
    content: options.prompt.trim(),
    n_slides: options.slides === "Automático" ? null : Number(options.slides),
    language: languages[options.language] || null,
    file_paths: filePaths.length ? filePaths : null,
    tone: "educational",
    verbosity: "standard",
    instructions,
    include_table_of_contents: false,
    include_title_slide: true,
    web_search: false,
    generation_mode: "standard",
  };
}
