# Stuff

Stuff is a private list of the bins in your home: each bin’s number, a note, the items inside it, and one photo.

[![Next.js 15.5.27](https://img.shields.io/badge/Next.js-15.5.27-000000)](https://nextjs.org/)
[![React 19.3.0](https://img.shields.io/badge/React-19.3.0-149ECA)](https://react.dev/)
[![TypeScript 5.9.3](https://img.shields.io/badge/TypeScript-5.9.3-3178C6)](https://www.typescriptlang.org/)

Current version: 0.7.0

That number matches the version next to the logo in the app. When the app version changes, update `lib/changelog.ts`, this line, and the `version` field in `package.json` together.

Stuff runs on your own computer. It does not create an account, and it does not send your inventory to a hosted service. A new copy starts empty until you add bins or restore a backup.

## Contents

- [What this app is](#what-this-app-is)
- [Features](#features)
- [Technology](#technology)
- [What you need first](#what-you-need-first)
- [Install and run it](#install-and-run-it)
- [Configuration](#configuration)
- [How to use Stuff](#how-to-use-stuff)
- [Commands](#commands)
- [Project structure](#project-structure)
- [Tests and checks](#tests-and-checks)
- [Running a production build](#running-a-production-build)
- [Troubleshooting](#troubleshooting)
- [Limits, privacy, and license](#limits-privacy-and-license)

## What this app is

Stuff is for a person who keeps belongings in numbered bins and wants to look up what is in them. You add a bin, give it a number, write a note, list the items and how many you have, and attach a photo. Later you search by bin number, note, or item name.

It is a small single-user app. There is no login, no sharing between accounts, and no separate database program to install. The list is a file on the computer where the app is running.

This repository does not include a phone-store app, a Docker setup, or a hosted deploy. You open Stuff in a web browser after starting it with Node.js. The page can be opened on a phone browser while the computer that runs the server is on.

## Features

**Bins**

- Add a bin with **+ Bin**. The first bin is numbered `01`. The next bin uses the next number.
- Change a bin number to any positive whole number, such as `2` or `02`. Stuff stores it as at least two digits (`02`). A number already used by another bin is rejected.
- Write a note, such as where the bin sits or what kind of thing is in it.
- Delete a bin after a confirmation step. Deleting a bin removes it from the list. It does not delete that bin’s photo file from disk.

**Items**

- Add an item by name. It starts at a quantity of 1. A blank name is ignored.
- Increase or decrease the quantity. At 0, the item is removed. There is also a **Delete** button on each item.
- On a phone, the keyboard stays open after **Add** so you can type the next item.

**Photos**

- Add one photo per bin from the bin screen. The file is saved as `bin_<number>.jpg`.
- Switch the home screen between **Bins** (striped cards) and **Photos** (the picture, when one exists). A bin with a photo still shows a small “Photo” mark in the striped view. The choice is remembered in that browser.

**Search**

- The search box matches bin numbers, notes, and item names. It only filters bins already loaded. It does not search a separate service.

**Backup and version**

- **Backup** downloads a `.zip` file named like `stuff-backup-2026-09-21.zip`.
- **Restore** replaces the current bins and photos with that zip, after you press **Replace**.
- The version button next to the logo opens a changelog. Times are shown in US Central Time.

## Technology

These are the parts that actually run the app. Versions are the ones locked in `package-lock.json`.

| Piece | Locked version | Role |
| --- | --- | --- |
| [Next.js](https://nextjs.org/) | 15.5.27 | Builds the website and handles saving, backup, and photos on the server. |
| [React](https://react.dev/) | 19.3.0 | Updates the page when you add bins, search, or edit items. |
| [TypeScript](https://www.typescriptlang.org/) | 5.9.3 | The language the source code is written in. |
| [Tailwind CSS](https://tailwindcss.com/) | 4.3.3 | The styling for layout, color, and text. |
| [fflate](https://github.com/101arrowz/fflate) | 0.8.3 | Creates and reads the zip backup on the server. |

Node.js runs the server. npm (which comes with Node.js) installs those pieces. There is no Python app, no database server, and no Docker file in this repository.

Your inventory is not stored in a database. It is stored in `data/inventory.json`. Photos are stored as files in `public/images/`.

## What you need first

You need a computer where you can install software, a web browser, and an internet connection for the first download. You do not need an account, an API key, or a database.

Install **Node.js 22.13 or newer** (or Node.js 24 or newer). npm is included. Node.js 20.19 or newer also matches the version range required by the lint tool in this project. Older Node.js versions are outside that range.

This repository was previously checked with Node.js 22.14.0. That note is from an earlier debug pass in the project. It is not a claim that every computer has been tested.

**Node.js** is the program that runs Stuff. **npm** is the tool that downloads the packages listed in `package.json`.

Check what you already have. Open a terminal (the next section shows how) and run:

```
node -v
```

```
npm -v
```

`node -v` should print `v22.13.0` or a higher 22.x version, or `v24` or higher. `v20.19.0` or a higher 20.x version is also inside the lint tool’s supported range. If the command is not found, or the number is older, install Node.js before continuing.

Download Node.js from the official site: [https://nodejs.org](https://nodejs.org). Use the installer for your system (Windows, macOS, or Linux). After it finishes, close and reopen the terminal, then run `node -v` again.

**Git** is the tool that downloads the project folder from GitHub. You can skip Git if you download a zip instead.

```
git --version
```

If that fails, install Git from [https://git-scm.com](https://git-scm.com). The Windows installer can be left on its default options. macOS may offer to install command-line tools the first time you run `git`. Linux users can install the `git` package from their distribution.

A current version of Chrome, Edge, Firefox, or Safari is enough to use the page. Nothing in this repository asks you to install a browser extension.

## Install and run it

Do the steps in order. Commands are copied as-is: do not type a `$` in front of them. Press Enter after each command.

Every command from “go into the project folder” onward must be run in the project folder. That folder is the one that contains `package.json`.

### Open a terminal

A terminal is a window where you type commands. It is also called Command Prompt, PowerShell, or Terminal.

- **macOS:** press Command and Space together, type `Terminal`, and press Return. You can also open Applications, then Utilities, then Terminal.
- **Windows:** open the Start menu, type `PowerShell`, and open Windows PowerShell. Command Prompt works too. The commands in this guide are the same in both.
- **Linux:** open the application menu and start the program named Terminal. On Ubuntu, Ctrl+Alt+T often opens it. Other distributions use their own menu.

You will see a blinking cursor. That is where the command goes.

### Get the code

**With Git.** This creates a new folder named `Stuff` in whatever folder your terminal is using right now. To put it in your home folder first:

```
cd ~
```

On Windows PowerShell, `cd ~` also moves to your user folder. Then:

```
git clone https://github.com/nickelz34/Stuff.git
```

**Without Git.** Open [https://github.com/nickelz34/Stuff](https://github.com/nickelz34/Stuff), choose **Code**, then **Download ZIP**. Unzip it. The folder is often named `Stuff-main`.

### Go into the project folder

If you cloned:

```
cd Stuff
```

If you unzipped a download, use the folder name you actually have:

```
cd Stuff-main
```

`cd` means “change directory,” which is the terminal’s way of opening a folder.

Check that you are in the right place.

- macOS or Linux:

```
pwd
ls package.json
```

- Windows Command Prompt:

```
cd
dir package.json
```

- Windows PowerShell:

```
pwd
dir package.json
```

`pwd` (or `cd` with nothing after it, in Command Prompt) prints the folder you are in. The name should end in `Stuff` or `Stuff-main`. `package.json` should be listed. If it is not, you are in the wrong folder. Do not run the later commands until it is listed.

### Install the project's packages

```
npm install
```

npm reads `package.json` and `package-lock.json`, then downloads the exact packages this project locked. It creates a `node_modules` folder. That folder is large, it is only for the tools, and you do not edit it. The download needs the internet and can take a few minutes. When it finishes, the terminal prompt comes back.

You only do this the first time on this computer, or again if you change the package list.

There is no separate database to create, no migration command, and no sample data to load. A new install has no bins until you add them.

### There is no setup file

Stuff does not read environment variables. There is no `.env` file to copy, and no secret to paste in. If a guide for a different project tells you to create `.env`, that step does not apply here.

The inventory file is created for you the first time a bin is saved. You do not create `data/inventory.json` by hand.

### Start the app

```
npm run dev
```

Leave this terminal open. `npm run dev` starts Next.js in development mode. When it is ready, the terminal prints a local address. For this project’s script, that address is normally:

[http://localhost:3000](http://localhost:3000)

`localhost` means “this computer.” Open that address in your browser. If the terminal prints a different local address, open the address it printed. That happens when port 3000 is already taken.

You are in the right place when you see the Stuff logo, a version button such as `v0.7.0`, a **+ Bin** button, and either your bins or the text “No bins yet. Add one to start.”

This command is for local use. It is not a public hosting setup.

### Stop the app

Click the terminal where `npm run dev` is running and press **Ctrl+C**. On a Mac this is Control+C, not Command+C. The terminal asks no further questions in a normal Next.js shutdown; the prompt returns, and the browser page will stop loading until you start the app again.

Your bins are still on disk. Stopping the server does not delete `data/inventory.json` or the photos.

### Start it again later

Open a terminal, go to the same project folder, and start the server. You do not clone or run `npm install` again unless you removed the folder or you are on a different computer.

```
cd Stuff
npm run dev
```

Change `Stuff` if your folder has another name. Then open the local address the terminal prints, normally [http://localhost:3000](http://localhost:3000).

### Optional: open it from another device on your network

This is not required. Use it only when a phone or another computer on the same home network should connect to the server.

Stop the normal dev server with Ctrl+C first, then:

```
npm run dev:host
```

That runs `next dev -H 0.0.0.0`, which accepts connections from other devices. On the other device, open `http://` plus this computer’s local network address, plus `:3000`. An example shape is `http://192.168.1.20:3000`. The numbers will be different on your network.

- **Windows:** in another terminal, run `ipconfig` and look for the IPv4 address of your Wi-Fi or Ethernet adapter.
- **macOS:** open System Settings, then Network, and read the IP address for the active connection.
- **Linux:** use your system’s network settings. The address is the one on your LAN, not `0.0.0.0`.

There is no password. Anyone who can reach that address can view and change the inventory. Do not forward this port to the public internet.

## Configuration

There are no environment variables to set.

| Name | Purpose | Required | Default | Where it lives |
| --- | --- | --- | --- | --- |
| `data/inventory.json` | The bins, notes, items, and photo filenames. | Created automatically the first time you save. | Missing file means an empty list. | Project folder on the server. Not in git. |
| `public/images/` | Photo files, normally `bin_01.jpg` and similar. | Created when you add a photo. | Empty except a placeholder file, `.gitkeep`, in a fresh clone. | Project folder on the server. Photo files are not in git. |
| `stuff-show-photos` | Remembers **Bins** vs **Photos** in this browser. | No. | Photos shown (`1`). `0` means the striped bin view. | This browser’s local storage only. It is not in the inventory file. |

Edits you make in the app are saved to those files immediately. You do not restart the server after adding a bin or a photo.

If you change server source code or `next.config.mjs`, stop the server and run `npm run dev` again. Development mode reloads many code edits by itself. A change to `next.config.mjs` needs a restart.

`next.config.mjs` sets the Server Action upload limit to 10 MB. That is the limit for adding a photo through the bin screen. It is not a user setting in the page.

The photo view preference is stored in the browser. The inventory is stored on the server. Clearing the browser’s site data forgets the Bins/Photos choice. It does not delete your bins.

## How to use Stuff

Start the server and open the local address first. The steps below are what the page actually does.

### Add your first bin

1. Click **+ Bin**.
2. A panel opens for the new bin. Its number is the next free number, starting at `01`.
3. Click **Close** when you want to return to the grid. Closing saves the bin number and the note.

The home grid shows the bin number, the note (or “No notes”), how many different items are listed, and the total quantity.

### Edit a bin

Click a card.

- **Bin number.** Type a positive whole number and leave the field, or press Enter. `2` is stored as `02`. If that number is already used, the page reports that the bin already exists and keeps the old number. Pressing Escape also tries to save the number and the note, then closes the panel. If the number is invalid, the panel stays open.
- **Notes.** Type in **Notes**. The placeholder text is “What's in this bin?” The note saves when you leave the field, when you add or change an item, and when you close the panel.
- **Photo.** Under **Photo**, choose an image. Phones can use the camera because the file input asks for the environment camera. Stuff writes the file as `bin_<number>.jpg` using the bin’s current number. Renaming the bin renames that photo file to match. The bytes are stored as you uploaded them, with a `.jpg` name, even if the original file was a PNG or another type. See [Limits, privacy, and license](#limits-privacy-and-license).
- **Items.** Type a name in “Add an item” and press **Add** (or Enter). Use **+** and **−** to change the quantity. **−** at 1 removes the item, because a quantity of 0 deletes it. **Delete** removes that item immediately.

### Search and switch the card picture

The search box placeholder is “Search bin, notes, or item”. Type any part of a bin number, a note, or an item name. Clearing the box shows every bin again. “No bins match that search.” means the list is fine and the words do not match.

**Bins** shows striped cards. **Photos** shows each bin’s photo when it has one. The choice is saved in the browser under `stuff-show-photos`.

### Back up

Click **Backup**. The browser downloads a zip of the current inventory and the photos that belong to those bins. The server names it `stuff-backup-` plus the date in `YYYY-MM-DD`, plus `.zip`.

Keep that file somewhere outside the project folder if you want a copy that survives deleting the project.

A backup is refused by the server when it is outside these limits in `lib/backup.ts`:

| Limit | Maximum |
| --- | --- |
| Zip file size | 80 MB |
| Uncompressed contents | 120 MB |
| `inventory.json` inside the zip | 5 MB |
| One image | 10 MB |
| Bins | 2,000 |
| Items in one bin | 500 |

Notes in a backup must be 5,000 characters or fewer. An item name in a backup must be 200 characters or fewer. Item quantity must be a whole number from 0 through 1,000,000. The live edit screen does not show those same checks before you type. A later restore can reject a file that breaks them.

### Restore

**Restore replaces the whole inventory.** It is not a merge.

1. Click **Restore** and choose a `.zip` file. Any other name shows “Choose a .zip backup file.”
2. Read the question: “Replace all bins and photos with [file name]?”
3. Click **Replace** to continue, or **Cancel** to do nothing.

Replace overwrites `data/inventory.json` with the backup’s bins. Photos from the zip replace files of the same name. Image files in `public/images/` that are not part of the backup are deleted. The placeholder `.gitkeep` is left in place.

When it finishes, the page reports how many bins and photos were restored. If the zip is not a Stuff backup, the page shows the error from the server, such as “This zip is not a Stuff backup.” or “That backup is too large.”

There is no undo except another backup you already saved.

### Delete a bin

Open the bin, click **Delete bin**, then **Confirm delete**. **Cancel** goes back. This removes the bin from `data/inventory.json`. The photo file can remain in `public/images/`.

### Read what changed between versions

Click the version button (`v0.7.0` in this version). The dialog lists changes from `lib/changelog.ts`. Close it when you are done. Escape closes it too.

### If the page says something went wrong

The app has an error screen with **Try again**. That reloads the view. If it keeps failing, use [Troubleshooting](#troubleshooting).

## Commands

Run these in the project folder, the one that contains `package.json`.

| Command | When to use it |
| --- | --- |
| `npm install` | Once, after you download the code. Downloads packages into `node_modules`. |
| `npm run dev` | Every time you want to use Stuff locally. Development mode. Default address `http://localhost:3000`. |
| `npm run dev:host` | Optional. Same as dev, but other devices on your network can connect. No password. |
| `npm run build` | Builds a production copy into `.next`. Does not start the server. |
| `npm run start` | Serves the production build. Run `npm run build` first. Default address `http://localhost:3000`. |
| `npm test` | Runs the automated tests in `lib/*.test.ts`. Does not start the website. |
| `npm run lint` | Checks the code with ESLint. For development. It does not change your inventory. |

There is no format command and no database migration command in `package.json`.

Development mode (`npm run dev`) is the one to use while setting up and editing. Production mode (`npm run build`, then `npm run start`) serves the built files. Use only one of those servers at a time if both would use port 3000.

## Project structure

Generated folders such as `node_modules` and `.next` are left out. `data/` appears only after the app saves.

```
app/                     The website
  page.tsx               Home screen (bins, search, backup buttons)
  layout.tsx             Page title and icon
  actions.ts             Save bins, items, notes, and photos
  error.tsx              "Something went wrong" screen
  globals.css            Visual styles
  api/backup/route.ts    Download and upload a backup zip
  images/[name]/route.ts Serves a photo file
components/              Buttons, bin cards, bin editor, search, changelog
lib/                     Inventory file, backup rules, version list, tests
public/
  stuff-mark.png         Logo
  images/                Photo files (contents are not committed)
types.ts                 The shape of a bin and an item
package.json             Commands and package list
package-lock.json        Exact package versions npm installs
next.config.mjs          Next.js settings, including the 10 MB upload limit
tsconfig.json            TypeScript settings
eslint.config.mjs        Lint rules
postcss.config.mjs       CSS processing used by Tailwind
```

## Tests and checks

The tests do not need a database, a browser, or a running server. From the project folder:

```
npm test
```

That runs Node’s built-in test runner on `lib/changelog.test.ts`, `lib/backup.test.ts`, and `lib/inventory-db.test.ts`. One changelog test reads this README and checks that the line `Current version: 0.7.0` is still present and matches `package.json`.

```
npm run lint
```

Lint needs a Node.js version in ESLint’s range for this project: 20.19 or newer on the 20 line, 22.13 or newer on the 22 line, or 24 or newer. It prints problems in the code. `eslint . --max-warnings 0` means any warning fails the command.

## Running a production build

This repository has no Dockerfile, no compose file, no CI workflow, and no hosting config. What follows is only how to run the built-in production server on the same computer.

Stop `npm run dev` first so port 3000 is free.

```
npm run build
npm run start
```

`npm run build` compiles the app. `npm run start` serves that build, normally at [http://localhost:3000](http://localhost:3000). Use the address printed in the terminal if it differs.

The production server uses the same `data/inventory.json` and `public/images/` folder as development, as long as you start it from the project folder. Photos added or restored after `npm run start` are served by `app/images/[name]/route.ts`, because Next.js would otherwise only expose files that were already in `public/` when the server started.

This is still a single-user server with no login. Treat it as a local program. Nothing in this repository documents a hardened public deployment, and this file does not claim one.

## Troubleshooting

| What you see | What it usually means | What to do |
| --- | --- | --- |
| `node` or `npm` is not recognized | Node.js is not installed, or the terminal was opened before you installed it. | Install Node.js from [https://nodejs.org](https://nodejs.org), close the terminal, open a new one, and run `node -v`. |
| `npm` warns that the engine is not supported, or lint will not run | Node.js is older than the range in this project. | Install Node.js 22.13 or newer, or another version listed in [What you need first](#what-you-need-first). |
| `Could not read package.json` | The terminal is not in the project folder. | `cd` into the folder that contains `package.json`, then run the command again. |
| The browser cannot open the page | The server is not running, or you used the wrong address. | In the project folder run `npm run dev`, and open the local URL printed in that terminal. |
| The terminal says port 3000 is in use, or it prints port 3001 | Another program, often a previous Stuff server, already has port 3000. | Go to the other terminal and press Ctrl+C, or open the new URL the terminal printed. |
| “No bins yet” after you know you had bins | The server is using a different folder, or this is a new clone. | Start the server from the project folder that contains your `data` directory. A fresh clone has no inventory. Restoring a backup brings it back. |
| “Could not load bins.” | `data/inventory.json` exists but is not valid JSON, or the server threw while reading it. | Stop editing that file by hand. Restore a backup zip if you have one. |
| Restore says the zip is not a Stuff backup | The file is a normal zip, or it came from a different app. | Choose a zip downloaded with this app’s **Backup** button. |
| A photo does not appear | The file was saved under a `.jpg` name but the contents are another image type, or the server was started outside the project folder. | Upload a JPEG, and start the server from the folder that contains `package.json`. |
| Another device cannot connect | `npm run dev` only accepts local connections, or the phone is not on the same network. | Use `npm run dev:host` and the computer’s LAN address, not `localhost` and not `0.0.0.0`. |

**Do not delete `data/inventory.json` or `public/images/` unless you mean to erase the inventory.** If you delete `data/inventory.json` and start again, Stuff treats the list as empty. Deleting files in `public/images/` removes photos. Make a **Backup** first if you might want them back.

## Limits, privacy, and license

Stuff has no accounts. Whoever can open the server address can change the inventory. `npm run dev` is limited to your computer. `npm run dev:host` and a production server you expose on a network are not.

Inventory and photos stay in the project folder on that computer. They are listed in `.gitignore`, so a normal `git push` does not upload `data/inventory.json` or the photo files. The app does not contain analytics or a call to an external inventory service. Installing packages with npm does contact the npm registry. Using the app after that does not require an account.

Writes go through one in-process queue so two clicks in the same server do not tear the JSON file. Two servers pointed at the same folder are not coordinated. Run one server for a given project folder.

Other limits that are visible in the code:

- One photo filename per bin, always `bin_<number>.jpg`. Non-JPEG uploads are not converted. Browsers may refuse to draw a PNG that was stored under a `.jpg` name and served as JPEG.
- Photo upload through the bin form is limited to 10 MB by `next.config.mjs`.
- Deleting a bin does not delete its photo file.
- Restore replaces every bin and removes photo files that are not in the zip.
- Backup size limits are in the backup section above.
- There is no separate reset button. The ways to remove data are **Delete** on an item, **Delete bin**, **Restore**, or deleting the files yourself.

No security audit is documented in this repository. Do not treat this README as a security review.

**License.** This repository does not contain a license file. No license is granted by this README. Look at the GitHub repository, or ask the owner, before you copy or reuse the code.

**Bugs.** There is no contribution guide and no issue template in the repository. If the GitHub Issues tab is enabled, you can report a problem at [https://github.com/nickelz34/Stuff/issues](https://github.com/nickelz34/Stuff/issues). Include what you clicked, the output of `node -v`, the command you ran, and the error text. Do not paste passwords. Do not attach `data/inventory.json` or photos unless you are comfortable sharing what is stored in your bins.
