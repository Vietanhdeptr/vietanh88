const fs = require("fs");
const path = require("path");
const axios = require("axios");
const colors = require("colors");
const readline = require("readline");
const user_agents = require("./config/userAgents");
const settings = require("./config/config");
const { sleep, loadData, saveToken, isTokenExpired, saveJson, parseQueryString, decodeJWT } = require("./utils");
const { checkBaseUrl } = require("./checkAPI");

class ClientAPI {
  constructor(accountIndex, initData, session_name, baseURL) {
    this.accountIndex = accountIndex;
    this.queryId = initData;
    this.headers = {
      Accept: "application/json, text/plain, */*",
      "Accept-Encoding": "gzip, deflate, br",
      "Accept-Language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
      "Content-Type": "application/json",
      Origin: "https://miniapp.uxuy.one",
      referer: "https://miniapp.uxuy.one/",
      "Sec-Ch-Ua": '"Not/A)Brand";v="99", "Google Chrome";v="115", "Chromium";v="115"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "Cache-Control": "no-cache",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    };
    this.session_name = session_name;
    this.session_user_agents = this.#load_session_data();
    this.baseURL = baseURL;
    this.token = initData;
  }

  #load_session_data() {
    try {
      const filePath = path.join(process.cwd(), "session_user_agents.json");
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    } catch (error) {
      if (error.code === "ENOENT") {
        return {};
      } else {
        throw error;
      }
    }
  }

  #get_random_user_agent() {
    const randomIndex = Math.floor(Math.random() * user_agents.length);
    return user_agents[randomIndex];
  }

  #get_user_agent() {
    if (this.session_user_agents[this.session_name]) {
      return this.session_user_agents[this.session_name];
    }
    this.log(`Tạo user agent...`);
    const newUserAgent = this.#get_random_user_agent();
    this.session_user_agents[this.session_name] = newUserAgent;
    this.#save_session_data(this.session_user_agents);
    return newUserAgent;
  }

  #save_session_data(session_user_agents) {
    const filePath = path.join(process.cwd(), "session_user_agents.json");
    fs.writeFileSync(filePath, JSON.stringify(session_user_agents, null, 2));
  }

  #get_platform(userAgent) {
    const platformPatterns = [
      { pattern: /iPhone/i, platform: "ios" },
      { pattern: /Android/i, platform: "android" },
      { pattern: /iPad/i, platform: "ios" },
    ];

    for (const { pattern, platform } of platformPatterns) {
      if (pattern.test(userAgent)) {
        return platform;
      }
    }
    return "Unknown";
  }

  set_headers() {
    const platform = this.#get_platform(this.#get_user_agent());
    this.headers["sec-ch-ua"] = `"Not)A;Brand";v="99", "${platform} WebView";v="127", "Chromium";v="127"`;
    this.headers["sec-ch-ua-platform"] = platform;
    this.headers["User-Agent"] = this.#get_user_agent();
  }

  async log(msg, type = "info") {
    const accountPrefix = `[Account ${this.accountIndex + 1}]`;
    let logMessage = "";

    switch (type) {
      case "success":
        logMessage = `${accountPrefix} ${msg}`.green;
        break;
      case "error":
        logMessage = `${accountPrefix} ${msg}`.red;
        break;
      case "warning":
        logMessage = `${accountPrefix} ${msg}`.yellow;
        break;
      case "custom":
        logMessage = `${accountPrefix} ${msg}`.magenta;
        break;
      default:
        logMessage = `${accountPrefix} ${msg}`.blue;
    }
    console.log(logMessage);
  }

  async makeRequest(url, method, data = {}, retries = 1) {
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${this.token}`,
    };
    let currRetries = 0,
      success = false;
    do {
      try {
        const response = await axios({
          method,
          url,
          data,
          headers,
          timeout: 30000,
        });
        success = true;
        return { success: true, data: response.data.result };
      } catch (error) {
        this.log(`Request failed: ${url} | ${error.message} | trying again...`, "warning");
        success = false;
        await sleep(settings.DELAY_BETWEEN_REQUESTS);
        if (currRetries == retries) return { success: false, error: error.message };
      }
      currRetries++;
    } while (currRetries < retries && !success);
  }

  async auth() {
    const headers = { ...this.headers };
    let currRetries = 0,
      success = false;
    const url = `https://miniapp.uxuy.one/jwt`;
    const formData = new FormData();
    const data = this.queryId;
    formData.append("user", JSON.stringify(data.user));
    formData.append("chat_instance", "-298404396458566810");
    formData.append("chat_type", "channel");
    formData.append("auth_date", data.auth_date);
    formData.append("signature", data.signature);
    formData.append("hash", data.hash);
    formData.append("start_param", "A_1092680235_inviteEarn");

    do {
      currRetries++;
      try {
        const response = await axios.post(url, formData, { headers });
        success = true;
        return { success: true, data: response.data };
      } catch (error) {
        console.log(error.response.data);
        success = false;
        return { success: false, error: error.message };
      }
    } while (currRetries < retries && !success);
  }
}

async function wait(seconds) {
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`\r${colors.cyan(`[*] Chờ ${Math.floor(i / 60)} phút ${i % 60} giây để tiếp tục`)}`.padEnd(80));
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  readline.cursorTo(process.stdout, 0);
  readline.clearLine(process.stdout, 0);
  console.log(`Bắt đầu vòng lặp mới...`);
}

async function main() {
  console.log(colors.yellow(" Công cụ này được phát triển bởi VanhTeam – Hãy tham gia kênh Telegram của chúng tôi để cập nhật những công cụ mới nhất và nhận hỗ trợ nhanh chóng! 🚀👉 Tham gia ngay : https://t.me/vanhteam "));
  const { endpoint: hasIDAPI, message } = await checkBaseUrl();
  if (!hasIDAPI) return console.log(`API ID not found, try again later!`.red);
  console.log(`${message}`.yellow);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
