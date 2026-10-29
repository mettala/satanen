# Emergency guide for the owner

Use this when something is wrong and you need to stop things. Do the steps in order, one at a time. You do not need to understand the code. If a step does not look the way it is described, stop and write to the agent what you see.

Words used here:

- **Agents** are the AI helpers that change the code. They run only when you start them.
- **The website** is satanen.io.
- **The proxy** is the small server at api.satanen.io. It fetches pages from Yle and gives them to the app. Without it, the app shows no pages.
- **Terminal** is the Mac app where you type commands. Open it, then go to the Satanen project folder before you type anything below.

## Part 1: Stop the agents

1. Go to the window where Claude Code is running and press **Esc**. This stops the current job.
2. If it keeps going, close that window. Then quit Claude Code and Terminal with **Cmd + Q**.
3. Stop the weekly robot job on GitHub:
   1. Open github.com/mettala/satanen in a browser and sign in.
   2. Click the **Actions** tab.
   3. Click **Section map** in the list on the left.
   4. Click the **…** button at the top right and choose **Disable workflow**.
4. Stop the agents' GitHub access. See Part 4, GitHub, step 2.

## Part 2: Roll back the website (satanen.io)

Use this when the website shows a broken version after a change.

**Option A: the Cloudflare dashboard (easiest)**

1. Open dash.cloudflare.com and sign in.
2. Click **Workers & Pages**, then **satanen-web**.
3. Click **Deployments**. The list shows older versions with their dates and messages.
4. Find the last version that worked. Click the **…** next to it, then **Rollback**, and confirm.
5. Open satanen.io in a private browser window and check that the front page shows headlines.

**Option B: Terminal**

1. In Terminal, from the project folder, type `proxy/node_modules/.bin/wrangler rollback -c site/wrangler.toml` and press Return.
2. Choose the previous version when asked, and confirm.
3. Check satanen.io as in Option A, step 5.

If neither option works, tell the agent: "Redeploy the web app from the last commit that worked."

## Part 3: Stop the proxy (api.satanen.io)

Use this when the proxy is misbehaving, or when you want Yle calls to stop completely. The app will then show errors instead of pages.

1. Open dash.cloudflare.com and sign in.
2. Click **Workers & Pages**, then **satanen-proxy**.
3. Click **Settings**, then **Domains & Routes**.
4. Next to **api.satanen.io**, click **Remove**. The proxy no longer answers at that address, and no more calls go to Yle.
5. To start it again, add **api.satanen.io** back on the same page, or ask the agent to redeploy the proxy.

To remove the proxy completely, go to **Settings** and choose **Delete** at the bottom. Only do this if you are sure.

## Part 4: Revoke tokens (keys that let tools act for you)

A token is a long password that a tool uses to act as you. Revoke a token if it might have leaked, or if you stop using a tool.

**Cloudflare**

1. Open dash.cloudflare.com, click your profile picture, then **My Profile**, then **API Tokens**.
2. For each token listed, click **…** and choose **Delete** (or **Roll** to make a new one). The analytics token is one of them.
3. In Terminal, from the `proxy` folder, type `npx wrangler logout` and press Return. This signs the Cloudflare tool out on your Mac.

**GitHub (the agents use your GitHub login)**

1. Open github.com, click your picture, then **Settings**, then **Applications**.
2. Find **GitHub CLI** in the list of authorised apps (the Authorized OAuth Apps tab) and click **Revoke**. Agents can no longer act on GitHub with that login.
3. Under **Settings**, then **Developer settings**, then **Personal access tokens**, delete any token you do not recognise.
4. Later, when you want the agents back, run `gh auth login` in Terminal and follow the prompts yourself.

## Part 5: Rotate the Yle keys

Rotate the keys if they might have leaked, or when Yle asks you to. The keys are secrets: never paste them into a chat, an email or a file that is shared.

1. Sign in to developer.yle.fi with your Yle account and get a new **app_id** and **app_key** (the site shows how). Copy both. If you cannot find how, write to the agent. Then remove the old key on that site, if it lets you.
2. Open Terminal and go to the proxy folder: type `cd proxy` (inside the Satanen project folder) and press Return.
3. Type `npx wrangler secret put YLE_APP_ID` and press Return. Paste the new app_id when asked, then press Return.
4. Type `npx wrangler secret put YLE_APP_KEY` and press Return. Paste the new app_key when asked, then press Return.
5. If you also run the proxy on your Mac, change the same two values in the file `proxy/.dev.vars` with a text editor. Never commit that file.
6. Check the proxy. From the project folder, type `npm --prefix proxy run smoke` and press Return. If it finishes without an error, the keys work. If it prints an error, stop and tell the agent what you see.

## Part 6: After an emergency

- Write down what you saw and when, in one or two lines. The agent needs this to find the cause.
- Do not restart the agents until the website works again.
