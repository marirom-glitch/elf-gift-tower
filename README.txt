ELF GIFT TOWER - Cloudflare deploy steps (Mac)

1. Install Node.js (one time): go to nodejs.org, download the "LTS" installer, run it.
2. Unzip this folder somewhere easy, like your Desktop.
3. Open Terminal, type   cd   and a space, drag the elf-gift-tower folder into the Terminal window, press Enter.
4. Run:   npm install
5. Run:   npx wrangler login      (a browser opens - click Allow)
6. Run:   npx wrangler deploy
   It prints your game link, like https://elf-gift-tower.YOURNAME.workers.dev

Updating later: replace files in public/ or src/, then run   npx wrangler deploy   again.
Separate rooms (optional): add ?room=teamb to the link, e.g. .../?room=teamb
