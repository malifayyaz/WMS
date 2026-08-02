const Groq = require("groq-sdk");

// Lazy client so we always use the current GROQ_API_KEY from env
// (avoids stale key if .env changed without a full process restart pattern)
function createClient() {
  const apiKey = (process.env.GROQ_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is missing. Add it to backend/.env and restart the server.");
  }
  return new Groq({ apiKey });
}

let _groq;
module.exports = new Proxy(
  {},
  {
    get(_target, prop) {
      if (!_groq) _groq = createClient();
      const value = _groq[prop];
      return typeof value === "function" ? value.bind(_groq) : value;
    },
  }
);
