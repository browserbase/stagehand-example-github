/**
 * 🤘 Welcome to Stagehand!
 *
 * This is an example of how to use Stagehand to create a fun issue on GitHub.
 *
 * In order to do this, we make use of Browserbase's context persistence feature.
 * We also make use of the experimental `observe` action to fill in the form.
 *
 * The main() function will then create two browser sessions:
 * 		- one to login to GitHub
 * 		- one to use the cookies from the login session to create a new issue on GitHub
 *
 * TO RUN THIS PROJECT:
 * ```
 * npm install
 * npm run start
 * ```
 *
 */

import StagehandConfig from "./stagehand.config.js";
import { Stagehand } from "@browserbasehq/stagehand";
import { Browserbase } from "@browserbasehq/sdk";
import chalk from "chalk";
import dotenv from "dotenv";
import { announce } from "./utils.js";
import { promises as fs } from "fs";

dotenv.config();

let BROWSERBASE_PROJECT_ID: string;
let BROWSERBASE_API_KEY: string;
try {
  BROWSERBASE_PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID!;
  BROWSERBASE_API_KEY = process.env.BROWSERBASE_API_KEY!;
} catch (e) {
  throw new Error(
    "BROWSERBASE_PROJECT_ID and BROWSERBASE_API_KEY must be set in environment variables to run this example. Please check your .env file."
  );
}

const browserbase = new Browserbase({
  apiKey: BROWSERBASE_API_KEY,
});

/**
 * Creates a new session with a context ID and adds session cookies to the context
 * @param contextId - The ID of the context to persist
 */
async function persistContextSession(
  contextId: string,
  urlToLoginTo: string = "https://github.com/login"
) {
  const stagehand = new Stagehand({
    ...StagehandConfig,
    browserbaseSessionCreateParams: {
      projectId: BROWSERBASE_PROJECT_ID,
      browserSettings: {
        context: {
          id: contextId,
          persist: true,
        },
      },
    },
  });
  await stagehand.init();
  announce(
    `Session created with ID: ${stagehand.browserbaseSessionID}.\n\nSession URL: https://browserbase.com/sessions/${stagehand.browserbaseSessionID}`
  );
  const page = stagehand.page;
  await page.goto(urlToLoginTo);

  announce(
    `Opening the debugger URL in your default browser. When you login, the following session will remember your authentication. Once you're logged in, press enter to continue...`
  );

  console.log(
    chalk.yellow("\n\nOnce you're logged in, press enter to continue...\n\n")
  );
  await openDebuggerUrl(stagehand.browserbaseSessionID!);
  await waitForEnter();
  await stagehand.close();
  console.log("Waiting 10 seconds for the context to be persisted...");
  await new Promise((resolve) => setTimeout(resolve, 10000));
  console.log(
    chalk.green("Ready to open a new session with the persisted context!")
  );
}

/**
 * Opens a new session with a context ID and uses the cookies from the context to automatically login
 * @param contextId - The ID of the persisted context
 */
async function openPersistedContextSession(contextId: string) {
  const stagehand = new Stagehand({
    ...StagehandConfig,
    browserbaseSessionCreateParams: {
      projectId: BROWSERBASE_PROJECT_ID,
      browserSettings: {
        context: {
          id: contextId,
          persist: false, // We don't need to persist this context since we're already logged in
        },
      },
    },
  });
  await stagehand.init();
  const page = stagehand.page;
  announce(
    `Opening the debugger URL in your default browser. This session should take you to the logged in session if the context was persisted. ${chalk.red(
      "If not, try deleting context.txt and running npm run start again."
    )}`
  );
  await openDebuggerUrl(stagehand.browserbaseSessionID!);
  // This will be logged in
  await page.goto(`https://github.com/browserbase/stagehand/issues/new`);

  //   Generate a list of form elements with actionable inputs
  const formCandidates = await page.observe({
    instruction: `Fill in the form with the following values:
	Title: "My computer is on fire"
	Description: "I accidentally navigated to your Instagram using Stagehand and caused my laptop to overheat. Please help."
	Then click the "create" button
	`,
    returnAction: true,
    onlyVisible: false,
  });
  console.log("formCandidates", formCandidates);

  // Fill in the form with the values
  for (const candidate of formCandidates) {
    await page.act(candidate);
  }

  await waitForEnter();
  await stagehand.close();
}

/*
 * MAIN FUNCTION
 */
async function main() {
  if (StagehandConfig.env === "LOCAL") {
    throw new Error(
      "Your Stagehand config is set to LOCAL mode. Please set env to BROWSERBASE in stagehand.config.ts to use this feature."
    );
  }
  // Check for existing context ID
  const existingContextId = await loadContextId();

  if (existingContextId) {
    console.log("Found existing context ID:", existingContextId);
    // Open the persisted context session directly
    await openPersistedContextSession(existingContextId);
    return;
  }

  // Create a new context if none exists
  const bbContext = await browserbase.contexts.create({
    projectId: BROWSERBASE_PROJECT_ID,
  });
  console.log("Created new context:", bbContext.id);

  // Save the context ID
  await saveContextId(bbContext.id);

  // Create a new session with the context
  await persistContextSession(bbContext.id);
  announce(
    "Waiting 10 seconds before opening the persisted context session..."
  );
  await new Promise((resolve) => setTimeout(resolve, 10000));

  // Open the persisted context session
  await openPersistedContextSession(bbContext.id);
}

(async () => {
  await main();
})();

// Wait for enter key press
async function waitForEnter() {
  await new Promise<void>((resolve) => {
    process.stdin.once("data", () => resolve());
  });
}

// Open debugger URL in default browser
async function openDebuggerUrl(sessionId: string) {
  const { debuggerFullscreenUrl } = await browserbase.sessions.debug(sessionId);
  const { exec } = await import("child_process");
  const platform = process.platform;
  const command =
    platform === "win32"
      ? "start"
      : platform === "darwin"
      ? "open"
      : "xdg-open";
  exec(`${command} ${debuggerFullscreenUrl}`);
}

async function saveContextId(contextId: string) {
  await fs.writeFile("context.txt", contextId);
}

async function loadContextId(): Promise<string | null> {
  try {
    return await fs.readFile("context.txt", "utf-8");
  } catch (error) {
    return null;
  }
}
