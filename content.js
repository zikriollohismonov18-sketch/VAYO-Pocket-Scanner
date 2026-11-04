
(() => {
  "use strict";

  if (document.getElementById("vayo-v5")) return;

  const root = document.createElement("div");
  root.id = "vayo-v5";

  root.innerHTML = `
    <div class="vayo-title">VAYO AI Pocket Scanner V5</div>

    <div class="vayo-row">
      <button id="vayo-share">Пайвасти экран</button>
      <button id="vayo-stop">Қатъ</button>
    </div>

    <div class="vayo-row">
      <button id="vayo-region">Минтақаи график</button>
      <button id="vayo-scan">SCAN</button>
    </div>

    <div class="vayo-row">
      <button id="vayo-auto">AUTO: OFF</button>
      <button id="vayo-hide">Пинҳон</button>
    </div>

    <div id="vayo-result" class="vayo-status wait">WAIT</div>

    <div class="vayo-row">
      Сабз: <b id="vayo-green">—</b> |
      Сурх: <b id="vayo-red">—</b>
    </div>

    <div class="vayo-row">
      Свечаҳои ёфтшуда:
      <b id="vayo-candles">0</b>
    </div>

    <div class="vayo-row">
      Тамоюл:
      <b id="vayo-trend">—</b>
    </div>

    <div class="vayo-small" id="vayo-info">
      Аввал экранро пайваст кун.
    </div>

    <div class="vayo-small">
      Сигналҳо таҷрибавӣ мебошанд.
      Барои савдои воқеӣ тасдиқ нашудаанд.
      Савдо худкор кушода намешавад.
    </div>
  `;

  document.body.appendChild(root);

  const $ = id => document.getElementById(id);

  const video = document.createElement("video");
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", {
    willReadFrequently: true
  });

  let stream = null;
  let timer = null;
  let region = null;
  let history = [];

  function message(text) {
    $("vayo-info").textContent = text;
  }

  function result(direction) {
    const el = $("vayo-result");
    el.textContent = direction;
    el.className = "vayo-status " +
      direction.toLowerCase();
  }

  async function share() {
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        message("Браузер мубодилаи экранро дастгирӣ намекунад.");
        return;
      }

      if (stream) stop();

      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 5 },
        audio: false
      });

      video.srcObject = stream;
      await video.play();

      stream.getVideoTracks()[0].addEventListener(
        "ended", stop, { once: true }
      );

      message("Экран пайваст шуд. Минтақаро интихоб кун.");
    } catch (err) {
      message("Пайваст нашуд: " + err.message);
    }
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    $("vayo-auto").textContent = "AUTO: OFF";

    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }

    stream = null;
    video.srcObject = null;
    region = null;
    history = [];
    result("WAIT");
    message("Экран қатъ шуд.");
  }

  function capture() {
    if (!stream || !video.videoWidth) {
      message("Аввал экранро пайваст кун.");
      return false;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return true;
  }

  function chooseRegion() {
    if (!capture()) return;

    const overlay = document.createElement("div");

    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483646",
      cursor: "crosshair",
      background: "rgba(0,0,0,.12)"
    });

    const rectangle = document.createElement("div");

    Object.assign(rectangle.style, {
      position: "fixed",
      border: "2px solid #28ff9e",
      background: "rgba(40,255,158,.12)",
      pointerEvents: "none"
    });

    overlay.appendChild(rectangle);
    document.body.appendChild(overlay);

    let start = null;

    overlay.onpointerdown = e => {
      start = { x: e.clientX, y: e.clientY };
      overlay.setPointerCapture(e.pointerId);
    };

    overlay.onpointermove = e => {
      if (!start) return;

      const x = Math.min(start.x, e.clientX);
      const y = Math.min(start.y, e.clientY);
      const w = Math.abs(e.clientX - start.x);
      const h = Math.abs(e.clientY - start.y);

      Object.assign(rectangle.style, {
        left: x + "px",
        top: y + "px",
        width: w + "px",
        height: h + "px"
      });
    };

    overlay.onpointerup = e => {
      if (!start) return;

      const x = Math.min(start.x, e.clientX);
      const y = Math.min(start.y, e.clientY);
      const w = Math.abs(e.clientX - start.x);
      const h = Math.abs(e.clientY - start.y);

      overlay.remove();

      if (w < 30 || h < 30) {
        message("Минтақа хеле хурд аст.");
        return;
      }

      const sx = canvas.width / window.innerWidth;
      const sy = canvas.height / window.innerHeight;

      region = {
        x: Math.floor(x * sx),
        y: Math.floor(y * sy),
        w: Math.floor(w * sx),
        h: Math.floor(h * sy)
      };

      history = [];
      message("Минтақа интихоб шуд. SCAN-ро пахш кун.");
    };
  }

  function classify(R, G, B) {
    if (G > 75 && G > R * 1.35 && G > B * 1.12)
      return 1;

    if (R > 85 && R > G * 1.3 && R > B * 1.15)
      return -1;

    return 0;
  }

  function detectCandles(data, width, height) {
    const columns = [];

    for (let x = 0; x < width; x += 3) {
      let green = 0;
      let red = 0;
      let minY = height;
      let maxY = -1;

      for (let y = 0; y < height; y += 2) {
        const i = (y * width + x) * 4;
        const c = classify(
          data[i], data[i + 1], data[i + 2]
        );

        if (c !== 0) {
          if (c === 1) green++;
          else red++;

          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }

      columns.push({
        x,
        green,
        red,
        minY,
        maxY,
        active: green + red >= 4
      });
    }

    const groups = [];
    let current = [];

    function flush() {
      if (current.length >= 2) {
        const g = current.reduce(
          (a, b) => a + b.green, 0
        );

        const r = current.reduce(
          (a, b) => a + b.red, 0
        );

        groups.push({
          x: current[0].x,
          endX: current[current.length - 1].x,
          color: g > r ? 1 : -1,
          green: g,
          red: r,
          minY: Math.min(...current.map(v => v.minY)),
          maxY: Math.max(...current.map(v => v.maxY))
        });
      }

      current = [];
    }

    for (const col of columns) {
      if (col.active) current.push(col);
      else flush();
    }

    flush();

    return groups.filter(c =>
      c.endX - c.x >= 4 &&
      c.maxY - c.minY >= 6
    );
  }

  function scan() {
    if (!capture()) return;

    if (!region) {
      message("Аввал минтақаи графикро интихоб кун.");
      return;
    }

    const x = Math.max(0, region.x);
    const y = Math.max(0, region.y);
    const w = Math.min(region.w, canvas.width - x);
    const h = Math.min(region.h, canvas.height - y);

    if (w < 20 || h < 20) {
      message("Минтақа нодуруст аст.");
      return;
    }

    const img = ctx.getImageData(x, y, w, h);
    const data = img.data;

    let green = 0;
    let red = 0;

    for (let i = 0; i < data.length; i += 16) {
      const c = classify(
        data[i], data[i + 1], data[i + 2]
      );

      if (c === 1) green++;
      if (c === -1) red++;
    }

    $("vayo-green").textContent = green;
    $("vayo-red").textContent = red;

    const candles = detectCandles(data, w, h);

    $("vayo-candles").textContent = candles.length;

    if (candles.length < 5) {
      result("WAIT");
      $("vayo-trend").textContent = "Номаълум";
      message("Свечаҳои кофӣ муайян нашуданд.");
      return;
    }

    const last = candles.slice(-5);
    const ups = last.filter(c => c.color === 1).length;
    const downs = last.filter(c => c.color === -1).length;

    const trend =
      ups >= 4 ? "Боло" :
      downs >= 4 ? "Поён" :
      "Омехта";

    $("vayo-trend").textContent = trend;

    history.push({
      time: Date.now(),
      ups,
      downs,
      trend
    });

    if (history.length > 30) history.shift();

    const recent = history.slice(-3);

    if (recent.length < 3) {
      result("WAIT");
      message("Барои тасдиқ 3 скан лозим аст.");
      return;
    }

    const allUp = recent.every(v => v.ups >= 4);
    const allDown = recent.every(v => v.downs >= 4);

    if (allUp) {
      result("CALL");
      message("Тамоюли боло дар 3 скан мушоҳида шуд.");
    } else if (allDown) {
      result("PUT");
      message("Тамоюли поён дар 3 скан мушоҳида шуд.");
    } else {
      result("WAIT");
      message("Тамоюл тасдиқ нашуд.");
    }
  }

  $("vayo-share").onclick = share;
  $("vayo-stop").onclick = stop;
  $("vayo-region").onclick = chooseRegion;
  $("vayo-scan").onclick = scan;

  $("vayo-auto").onclick = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
      $("vayo-auto").textContent = "AUTO: OFF";
      return;
    }

    if (!stream || !region) {
      message("Аввал экран ва минтақаро интихоб кун.");
      return;
    }

    scan();

    timer = setInterval(scan, 3000);
    $("vayo-auto").textContent = "AUTO: ON";
  };

  $("vayo-hide").onclick = () => {
    const hidden = root.classList.toggle("vayo-hidden");
    if (hidden) {
      const restore = document.createElement("button");
      restore.textContent = "VAYO";
      restore.id = "vayo-restore";

      Object.assign(restore.style, {
        position: "fixed",
        right: "15px",
        bottom: "15px",
        zIndex: "2147483647",
        padding: "10px",
        background: "#23c996",
        border: "none",
        borderRadius: "8px"
      });

      document.body.appendChild(restore);

      restore.onclick = () => {
        root.classList.remove("vayo-hidden");
        restore.remove();
      };
    }
  };
})();
