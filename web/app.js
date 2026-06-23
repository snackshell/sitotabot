const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
  document.body.classList.toggle("dark", tg.colorScheme === "dark");
}

const tabs = document.querySelectorAll(".tab");
const views = document.querySelectorAll(".view");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const view = tab.dataset.view;
    tabs.forEach((item) => item.classList.toggle("active", item === tab));
    views.forEach((item) => item.classList.toggle("active", item.id === view));
  });
});

document.getElementById("themeToggle")?.addEventListener("click", () => {
  document.body.classList.toggle("dark");
});

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.action;
    const payload = JSON.stringify({ type: action, source: "mini_app" });

    if (tg?.sendData) {
      tg.sendData(payload);
    } else {
      showResult(action === "join" ? "Join request prepared." : "Eligibility check prepared.");
    }
  });
});

document.querySelectorAll("[data-command]").forEach((button) => {
  button.addEventListener("click", () => {
    const command = button.dataset.command;
    if (tg?.sendData) {
      tg.sendData(JSON.stringify({ type: "command", command }));
    } else {
      showResult(`${command} selected.`);
    }
  });
});

document.getElementById("checkEligibility")?.addEventListener("click", () => {
  const giveawayId = document.getElementById("giveawayId")?.value.trim();
  if (!giveawayId) {
    showResult("Enter a giveaway ID first.", false);
    return;
  }

  if (tg?.sendData) {
    tg.sendData(JSON.stringify({ type: "check_eligibility", giveawayId }));
  } else {
    showResult("Eligibility request prepared.");
  }
});

function showResult(message, ok = true) {
  const result = document.getElementById("eligibilityResult");
  if (!result) return;

  result.querySelector("h3").textContent = ok ? "Ready" : "Needs input";
  result.querySelector("p").textContent = message;
  result.querySelector(".result-dot").style.background = ok ? "var(--brand-2)" : "var(--danger)";
}
