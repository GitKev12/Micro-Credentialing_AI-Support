export function getEnvironmentConfig() {
  return {
    openAiApiKey: process.env.OPENAI_API_KEY || "",
    // A model this project's key can actually reach. The previous default named
    // one the account cannot see, so every generation call would have failed on
    // its first request — after being authorised, which is the confusing way to
    // find out. Writing quiz questions from supplied lesson text is not work
    // that needs the largest model; set OPENAI_MODEL to override.
    openAiModel: process.env.OPENAI_MODEL || "gpt-4o-mini"
  };
}
