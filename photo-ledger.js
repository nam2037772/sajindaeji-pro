(function () {
  const STORAGE_KEY = "photo-ledger-v1";
  function formatLocalDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const today = formatLocalDate(new Date());

  const state = {
    meta: {
      projectName: "",
      reportDate: today,
      authorName: "",
      projectMemo: ""
    },
    items: []
  };

  const els = {
    projectName: document.getElementById("projectName"),
    reportDate: document.getElementById("reportDate"),
    authorName: document.getElementById("authorName"),
    projectMemo: document.getElementById("projectMemo"),
    photoInput: document.getElementById("photoInput"),
    importJsonInput: document.getElementById("importJsonInput"),
    dropZone: document.getElementById("dropZone"),
    ledgerList: document.getElementById("ledgerList"),
    emptyState: document.getElementById("emptyState"),
    rowTemplate: document.getElementById("rowTemplate"),
    photoCount: document.getElementById("photoCount"),
    searchInput: document.getElementById("searchInput"),
    addBlankBtn: document.getElementById("addBlankBtn"),
    clearBtn: document.getElementById("clearBtn"),
    printBtn: document.getElementById("printBtn"),
    printPreview: document.getElementById("printPreview"),
    exportJsonBtn: document.getElementById("exportJsonBtn"),
    saveAsJsonBtn: document.getElementById("saveAsJsonBtn")
  };

  function uid() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function debounce(fn, wait) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      if (e.name === "QuotaExceededError") {
        alert("저장 공간이 부족합니다. JSON 백업 후 일부 항목을 삭제하세요.");
      }
    }
  }

  const saveSoon = debounce(save, 250);

  function load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const saved = JSON.parse(raw);
      state.meta = Object.assign(state.meta, saved.meta || {});
      state.items = Array.isArray(saved.items) ? saved.items : [];
    } catch (error) {
      console.warn("사진대장 저장 데이터를 읽지 못했습니다.", error);
    }
  }

  function syncMetaToForm() {
    els.projectName.value = state.meta.projectName || "";
    els.reportDate.value = state.meta.reportDate || today;
    els.authorName.value = state.meta.authorName || "";
    els.projectMemo.value = state.meta.projectMemo || "";
  }

  function syncMetaFromForm() {
    state.meta.projectName = els.projectName.value.trim();
    state.meta.reportDate = els.reportDate.value;
    state.meta.authorName = els.authorName.value.trim();
    state.meta.projectMemo = els.projectMemo.value.trim();
    saveSoon();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function fileToImageData(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const maxSize = 1400;
          const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function addFiles(files) {
    const images = Array.from(files).filter((file) => file.type.startsWith("image/"));
    for (const file of images) {
      const image = await fileToImageData(file);
      state.items.push({
        id: uid(),
        image,
        location: "",
        description: file.name.replace(/\.[^.]+$/, ""),
        takenDate: state.meta.reportDate || today,
        memo: ""
      });
    }
    save();
    render();
  }

  function addBlankItem() {
    state.items.push({
      id: uid(),
      image: "",
      location: "",
      description: "",
      takenDate: state.meta.reportDate || today,
      memo: ""
    });
    save();
    render();
  }

  function updateItem(id, patch) {
    const item = state.items.find((entry) => entry.id === id);
    if (!item) return;
    Object.assign(item, patch);
    saveSoon();
  }

  function moveItem(id, direction) {
    const index = state.items.findIndex((entry) => entry.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= state.items.length) return;
    const [item] = state.items.splice(index, 1);
    state.items.splice(nextIndex, 0, item);
    save();
    render();
  }

  function deleteItem(id) {
    state.items = state.items.filter((entry) => entry.id !== id);
    save();
    render();
  }

  function itemMatchesSearch(item, term) {
    if (!term) return true;
    return [item.location, item.description, item.takenDate, item.memo]
      .join(" ")
      .toLowerCase()
      .includes(term);
  }

  function render() {
    const term = els.searchInput.value.trim().toLowerCase();
    const visibleItems = state.items.filter((item) => itemMatchesSearch(item, term));

    els.ledgerList.innerHTML = "";
    els.photoCount.textContent = state.items.length;
    els.emptyState.style.display = state.items.length ? "none" : "grid";
    buildPrintPreview();

    visibleItems.forEach((item) => {
      const index = state.items.findIndex((entry) => entry.id === item.id);
      const row = els.rowTemplate.content.firstElementChild.cloneNode(true);

      row.querySelector(".row-number").textContent = index + 1;

      const img = row.querySelector("img");
      img.src = item.image || "";
      img.alt = item.description || `사진 ${index + 1}`;

      const photoCell = row.querySelector(".photo-cell");
      if (!item.image) {
        photoCell.style.background = "repeating-linear-gradient(45deg, #eef3f1, #eef3f1 12px, #f8fbfa 12px, #f8fbfa 24px)";
      }

      const location = row.querySelector(".location");
      const description = row.querySelector(".description");
      const takenDate = row.querySelector(".taken-date");
      const memo = row.querySelector(".memo");

      location.value = item.location || "";
      description.value = item.description || "";
      takenDate.value = item.takenDate || "";
      memo.value = item.memo || "";

      location.addEventListener("input", () => updateItem(item.id, { location: location.value }));
      description.addEventListener("input", () => updateItem(item.id, { description: description.value }));
      takenDate.addEventListener("input", () => updateItem(item.id, { takenDate: takenDate.value }));
      memo.addEventListener("input", () => updateItem(item.id, { memo: memo.value }));

      row.querySelector(".replace-photo").addEventListener("change", async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        updateItem(item.id, { image: await fileToImageData(file) });
        save();
        render();
      });

      row.querySelector(".move-up").addEventListener("click", () => moveItem(item.id, -1));
      row.querySelector(".move-down").addEventListener("click", () => moveItem(item.id, 1));
      row.querySelector(".delete-row").addEventListener("click", () => deleteItem(item.id));

      els.ledgerList.appendChild(row);
    });
  }

  function buildPrintPreview() {
    const items = state.items;
    const pairs = [];

    for (let index = 0; index < items.length; index += 2) {
      const pair = [items[index], items[index + 1] || null];
      pairs.push(pair);
    }

    if (!pairs.length) {
      els.printPreview.innerHTML = `
        <section class="print-page">
          <article class="photo-card photo-card--empty">
            <div class="photo-frame">
              <div class="photo-placeholder">출력할 사진이 없습니다.</div>
            </div>
            <div class="photo-meta">
              <div class="photo-meta__title">사진대장</div>
            </div>
          </article>
          <article class="photo-card photo-card--empty">
            <div class="photo-frame">
              <div class="photo-placeholder">사진을 추가하면 여기에 출력됩니다.</div>
            </div>
            <div class="photo-meta">
              <div class="photo-meta__title">사진대장</div>
            </div>
          </article>
        </section>
      `;
      return;
    }

    els.printPreview.innerHTML = pairs
      .map((pair) => `
        <section class="print-page">
          ${pair
            .map((item, position) => {
              const title = item ? escapeHtml(item.description || "사진") : "";
              const location = item ? escapeHtml(item.location || "") : "";
              const takenDate = item ? escapeHtml(item.takenDate || "") : "";
              const memo = item ? escapeHtml(item.memo || "") : "";
              const safeSrc = escapeHtml(item && item.image ? item.image : "");
              const imageMarkup = item && item.image
                ? `<img src="${safeSrc}" alt="${title}" />`
                : `<div class="photo-placeholder">사진 없음</div>`;

              return `
                <article class="photo-card ${item ? "" : "photo-card--empty"}">
                  <div class="photo-frame">
                    ${imageMarkup}
                  </div>
                  <div class="photo-meta">
                    <table class="photo-meta-table">
                      <tbody>
                        <tr>
                          <th>공종</th>
                          <td>${memo || "-"}</td>
                          <th>위치</th>
                          <td>${location || "-"}</td>
                        </tr>
                        <tr>
                          <th>내용</th>
                          <td>${title || `사진 ${position + 1}`}</td>
                          <th>일자</th>
                          <td>${takenDate || "-"}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </article>
              `;
            })
            .join("")}
        </section>
      `)
      .join("");
  }

  function exportJson() {
    const content = JSON.stringify(state, null, 2);
    download(`사진대장-백업-${state.meta.reportDate || today}.json`, content, "application/json;charset=utf-8");
  }

  async function exportJsonSaveAs() {
    const content = JSON.stringify(state, null, 2);
    const defaultName = `사진대장-백업-${state.meta.reportDate || today}.json`;

    if (window.showSaveFilePicker) {
      try {
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: defaultName,
          types: [{ description: "사진대장 백업 파일", accept: { "application/json": [".json"] } }]
        });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
      } catch (err) {
        if (err.name !== "AbortError") {
          alert("저장에 실패했습니다: " + err.message);
        }
      }
    } else {
      const newName = prompt("저장할 파일 이름을 입력하세요:", defaultName);
      if (newName) {
        download(newName.endsWith(".json") ? newName : newName + ".json", content, "application/json;charset=utf-8");
      }
    }
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        state.meta = Object.assign(state.meta, data.meta || {});
        state.items = Array.isArray(data.items) ? data.items : [];
        syncMetaToForm();
        save();
        render();
      } catch (error) {
        alert("백업 파일을 읽지 못했습니다.");
      }
    };
    reader.readAsText(file, "utf-8");
  }

  [els.projectName, els.reportDate, els.authorName, els.projectMemo].forEach((input) => {
    input.addEventListener("input", syncMetaFromForm);
  });

  els.photoInput.addEventListener("change", (event) => addFiles(event.target.files));
  els.addBlankBtn.addEventListener("click", addBlankItem);
  els.searchInput.addEventListener("input", render);
  els.printBtn.addEventListener("click", () => {
    buildPrintPreview();
    const originalTitle = document.title;
    const projectPart = state.meta.projectName ? `-${state.meta.projectName}` : "";
    document.title = `사진대장${projectPart}-${state.meta.reportDate || today}`.replace(/[\\/:*?"<>|]/g, "_");
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  });
  els.exportJsonBtn.addEventListener("click", exportJson);
  els.saveAsJsonBtn.addEventListener("click", exportJsonSaveAs);

  els.importJsonInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file) importJson(file);
  });

  els.clearBtn.addEventListener("click", () => {
    if (!confirm("사진대장을 전부 비울까요? 백업하지 않은 사진과 내용은 사라집니다.")) return;
    state.items = [];
    save();
    render();
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    els.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.dropZone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    els.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.dropZone.classList.remove("dragover");
    });
  });

  els.dropZone.addEventListener("drop", (event) => addFiles(event.dataTransfer.files));

  load();
  syncMetaToForm();
  render();
})();




