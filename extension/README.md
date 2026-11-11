# Zero Form — Chrome extension

1. Run the app (`npm run dev` → http://localhost:5173), open `chrome://extensions`, and turn on **Developer mode**.
2. Click **Load unpacked** and select this `extension/` folder.
3. Open https://tcooc-co.gov.taipei/cp.aspx?n=1ddc8c221b97a1bd&s=5BA095ECA5D6FAB3, click **Fill all 7 forms with Zero Form**, and click **Allow** when Chrome asks to access apps on your local network. Without that, Chrome 142+ blocks a public HTTPS page from framing `localhost`.

Offline: open `extension/test-page.html` directly. It loads `content.js` itself.
