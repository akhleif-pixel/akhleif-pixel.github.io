// Page behaviour: works grid, piece detail, image viewer, and opening the 3D tour.
(function () {
  const PIECES = window.PIECES;
  const SIDES = window.EXHIBITION.sides;
  const img = (name) => `assets/img/${name}.jpg`;
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

  // Text block for one piece. Used by the modal and by the tour's side panel.
  function pieceInfo(p, { thumbs = true } = {}) {
    return `
      <p class="piece__tag">${SIDES[p.side]}</p>
      <h2 class="piece__title" id="pieceModalTitle">${esc(p.title)}</h2>
      <dl class="piece__facts">
        <dt>Media</dt><dd>${esc(p.media)}</dd>
        <dt>Size</dt><dd>${esc(p.size)}</dd>
      </dl>
      <p class="piece__text">${esc(p.text)}</p>
      <p class="piece__curation"><strong>In the exhibition</strong>${esc(p.curation)}</p>
      ${thumbs ? `<div class="piece__thumbs">${p.images.map((n, i) =>
        `<button data-zoom="${img(n)}" data-set="${p.id}" aria-label="Enlarge photo ${i + 1} of ${esc(p.title)}"><img src="${img(n + "-thumb")}" alt="" loading="lazy"></button>`).join("")}</div>` : ""}`;
  }

  // ----- works grid -----
  const grid = document.getElementById("grid");
  grid.innerHTML = PIECES.map((p, i) => `
    <button class="card" data-piece="${p.id}">
      <div class="card__img"><img src="${img(p.images[0] + "-thumb")}" alt="${esc(p.title)}" loading="lazy"></div>
      <div class="card__meta">
        <span class="card__num">${String(i + 1).padStart(2, "0")}</span>
        <span><div class="card__title">${esc(p.title)}</div><div class="card__media">${esc(p.media)}</div></span>
      </div>
    </button>`).join("");

  // ----- piece modal -----
  const modal = document.getElementById("pieceModal");
  const modalBody = document.getElementById("pieceModalBody");
  function openPiece(id) {
    const p = PIECES.find((x) => x.id === id);
    modalBody.innerHTML = `
      <div class="modal__hero"><img src="${img(p.images[0])}" alt="${esc(p.title)}" data-zoom="${img(p.images[0])}" data-set="${p.id}"></div>
      <div class="modal__info">
        ${pieceInfo(p, { thumbs: p.images.length > 1 })}
        <div class="piece__actions"><button class="btn btn--dark" data-open-tour="${p.id}">See it in the exhibition</button></div>
      </div>`;
    modal.showModal();
    modal.scrollTop = 0;
  }

  // ----- lightbox -----
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightboxImg");
  const lightboxNav = [document.getElementById("lightboxPrev"), document.getElementById("lightboxNext")];
  let zoomSet = [];
  // set: optional list of photos to step through with the arrows
  function zoom(src, set) {
    zoomSet = set && set.length > 1 ? set : [];
    lightboxImg.src = src;
    lightboxNav.forEach((b) => { b.hidden = !zoomSet.length; });
    if (!lightbox.open) lightbox.showModal();
  }
  function zoomStep(d) {
    if (!zoomSet.length) return;
    const i = zoomSet.findIndex((s) => lightboxImg.src.endsWith(s));
    lightboxImg.src = zoomSet[(i + d + zoomSet.length) % zoomSet.length];
  }
  lightboxNav[0].addEventListener("click", () => zoomStep(-1));
  lightboxNav[1].addEventListener("click", () => zoomStep(1));
  const photosOf = (p) => p.images.map(img);

  // ----- 3D tour (loaded only when first opened) -----
  const tourEl = document.getElementById("tour");
  let tour = null;
  async function openTour(pieceId) {
    if (modal.open) modal.close();
    tourEl.hidden = false;
    document.body.style.overflow = "hidden";
    try {
      if (!tour) {
        const mod = await import("./tour.js");
        tour = await mod.createTour({ pieceInfo, img, esc, zoom, photosOf });
      }
      tour.open(pieceId || null);
    } catch (err) {
      console.error(err);
      document.getElementById("tourLoading").textContent =
        "The 3D tour could not start on this device. You can still explore every piece in the Works section.";
    }
  }
  function closeTour() {
    tourEl.hidden = true;
    document.body.style.overflow = "";
    if (tour) tour.close();
  }
  document.getElementById("tourExit").addEventListener("click", closeTour);
  // A link to exhibition.html#tour (from the portfolio) starts in the tour.
  if (location.hash === "#tour") openTour();

  // ----- one click handler for everything -----
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-piece], [data-zoom], [data-open-tour], [data-close]");
    if (!t) {
      // click on a dialog's backdrop closes it
      if (e.target === modal || e.target === lightbox) e.target.close();
      return;
    }
    if (t.dataset.close !== undefined) t.closest("dialog").close();
    else if (t.dataset.zoom) {
      const p = PIECES.find((x) => x.id === t.dataset.set);
      zoom(t.dataset.zoom, p && photosOf(p));
    }
    else if (t.dataset.openTour !== undefined) openTour(t.dataset.openTour);
    else if (t.dataset.piece) openPiece(t.dataset.piece);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !tourEl.hidden && !lightbox.open) closeTour();
    if (lightbox.open && e.key === "ArrowLeft") zoomStep(-1);
    if (lightbox.open && e.key === "ArrowRight") zoomStep(1);
  });

  document.getElementById("year").textContent = new Date().getFullYear();
})();
