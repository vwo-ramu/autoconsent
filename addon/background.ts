/* global browser */
import { autoAction, enableLogs, runSelfTest } from "../lib/config";
import { ContentScriptMessage } from "../lib/messages";
import { RuleBundle } from "../lib/types";

interface PageActionState {
  [tabId: number]: {
    frameId: number; // (last) frameId that reported a popup
  }
}

const pageActionState: PageActionState = {};

let rules: RuleBundle = null;

async function loadRules() {
  const res = await fetch("./rules.json");
  rules = await res.json();
}

loadRules();

function showOptOutStatus(
  tabId: number,
  status: "success" | "complete" | "working" | "available"
) {
  let title = "Click to opt out";
  let icon = "icons/cookie.png";
  if (status === "success") {
    title = "Opt out successful!";
    icon = "icons/party.png";
  } else if (status === "complete") {
    title = "Opt out complete!";
    icon = "icons/tick.png";
  } else if (status === "working") {
    title = "Processing...";
    icon = "icons/cog.png";
  }
  browser.pageAction.setTitle({
    tabId,
    title,
  });
  browser.pageAction.setIcon({
    tabId,
    path: icon,
  });
}

browser.runtime.onMessage.addListener(
  (msg: ContentScriptMessage, sender: any) => {
    const tabId = sender.tab.id;
    const frameId = sender.frameId;
    const url = sender.url;
    enableLogs && console.log("received message", msg, sender);
    browser.pageAction.show(tabId);

    switch (msg.type) {
      case "init":
        browser.tabs.sendMessage(tabId, {
          type: "initResp",
          rules,
          config: {
            enabled: true,
            autoAction,
            disabledCmps: [],
          },
        }, {
          frameId,
        });
        break;
      case "popupFound":
        showOptOutStatus(tabId, "available");
        pageActionState[tabId] = {
          frameId,
        }
        break;
      case "optOutResult":
      case "optInResult":
        if (msg.result) {
          if (runSelfTest) {
            browser.tabs.sendMessage(tabId, {
              type: "selfTest",
            }, {
              frameId,
            });
          }
        }
        break;
      case "selfTestResult":
        if (msg.result) {
          showOptOutStatus(tabId, "success");
        }
        break;
      case "autoconsentDone":
        if (!runSelfTest) {
          // indicate success immediately
          showOptOutStatus(tabId, "success");
        }
        break;
    }
  }
);

browser.pageAction.onClicked.addListener((tab) => {
  const tabId = tab.id;
  const frameId = pageActionState[tabId].frameId;
  enableLogs && console.log("pageAction.onClicked", tabId, frameId);
  showOptOutStatus(tabId, "working");
  browser.tabs.sendMessage(tabId, {
    type: "optOut",
  }, {
    frameId,
  });
});
