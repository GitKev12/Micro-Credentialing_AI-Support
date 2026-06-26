export function getEnvironmentConfig() {
  return {
    openAiApiKey: process.env.OPENAI_API_KEY || "",
    openAiModel: process.env.OPENAI_MODEL || "gpt-5.5"
  };
}
