(() => {
  "use strict";

  const root = document.documentElement;
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const pendingSectionKey = "multiConverterPendingSection";

  function prefersReducedMotion() {
    return reducedMotionQuery.matches;
  }

  function closestElement(target, selector) {
    return target instanceof Element ? target.closest(selector) : null;
  }

  function samePageHashAnchor(anchor) {
    if (!anchor.hash) {
      return null;
    }

    const currentPath = window.location.pathname.replace(/\/$/, "");
    const anchorPath = anchor.pathname.replace(/\/$/, "");

    if (anchor.origin !== window.location.origin || anchorPath !== currentPath) {
      return null;
    }

    return document.getElementById(decodeURIComponent(anchor.hash.slice(1)));
  }

  function targetTop(target) {
    if (target instanceof HTMLElement) {
      return Math.max(target.offsetTop, 0);
    }

    return Math.max(window.scrollY + target.getBoundingClientRect().top, 0);
  }

  function sectionScrollTop(target) {
    return Math.max(targetTop(target), 0);
  }

  function scrollInstant(top) {
    const scrollTop = Math.max(Math.round(top), 0);
    const previousScrollBehavior = root.style.scrollBehavior;

    root.style.scrollBehavior = "auto";
    window.scrollTo({ left: 0, top: scrollTop, behavior: "auto" });

    if (document.scrollingElement) {
      document.scrollingElement.scrollTop = scrollTop;
    }

    document.documentElement.scrollTop = scrollTop;
    if (document.body) {
      document.body.scrollTop = scrollTop;
    }

    root.style.scrollBehavior = previousScrollBehavior;
  }

  function pushHash(anchor) {
    window.history.pushState(null, "", `${anchor.pathname}${anchor.search}${anchor.hash}`);
  }

  function initSmoothAnchors() {
    const handledPointerAnchors = new WeakSet();

    function scrollToTarget(anchor, target) {
      const top = targetTop(target);

      if (prefersReducedMotion()) {
        scrollInstant(top);
        pushHash(anchor);
        return;
      }

      window.scrollTo({ top, behavior: "smooth" });
      pushHash(anchor);
    }

    document.addEventListener("pointerdown", (event) => {
      if (event.defaultPrevented) {
        return;
      }

      const anchor = closestElement(event.target, 'a[href*="#"]');
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = samePageHashAnchor(anchor);
      if (!target) {
        return;
      }

      handledPointerAnchors.add(anchor);
      event.preventDefault();
      scrollToTarget(anchor, target);
    });

    document.addEventListener("click", (event) => {
      if (event.defaultPrevented) {
        return;
      }

      const anchor = closestElement(event.target, 'a[href*="#"]');
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }

      const target = samePageHashAnchor(anchor);
      if (!target) {
        return;
      }

      event.preventDefault();

      if (handledPointerAnchors.has(anchor)) {
        handledPointerAnchors.delete(anchor);
        return;
      }

      scrollToTarget(anchor, target);
    });
  }

  function initSectionNav() {
    const nav = document.querySelector("[data-section-nav]");
    if (!nav) {
      return;
    }

    const links = Array.from(nav.querySelectorAll("[data-section-id]")).filter(
      (link) => link instanceof HTMLAnchorElement
    );
    const sectionIds = new Set(links.map((link) => link.dataset.sectionId || "").filter(Boolean));
    const sections = Array.from(document.querySelectorAll("section[id]"))
      .filter((section) => section instanceof HTMLElement)
      .filter((section) => sectionIds.has(section.id) || sectionIds.has(section.dataset.navSection || ""));

    let activeId = "";
    let activeFrame = 0;
    let indicatorFrame = 0;
    let initialAlignmentCancelled = false;
    let scrollAnimationFrame = 0;
    const handledSectionLinks = new WeakSet();

    function normalizedPath(path) {
      return path.replace(/\/$/, "");
    }

    function landingPath() {
      const firstLink = links[0];
      return firstLink ? normalizedPath(firstLink.pathname) : "";
    }

    function savePendingSection(id) {
      try {
        window.sessionStorage.setItem(pendingSectionKey, id);
      } catch {
        // Storage can be unavailable in strict browser modes; the hash fallback still works.
      }
    }

    function readPendingSection() {
      try {
        return window.sessionStorage.getItem(pendingSectionKey) || "";
      } catch {
        return "";
      }
    }

    function clearPendingSection() {
      try {
        window.sessionStorage.removeItem(pendingSectionKey);
      } catch {
        // Nothing to clear when storage is unavailable.
      }
    }

    function isLandingSectionLink(link) {
      return link.origin === window.location.origin && normalizedPath(link.pathname) === landingPath();
    }

    function navigateToLandingSection(link) {
      const sectionId = link.dataset.sectionId || "";
      const url = new URL(`${link.pathname}${link.search}`, window.location.origin);
      url.searchParams.set("section", sectionId);
      savePendingSection(sectionId);
      window.location.assign(`${url.pathname}${url.search}`);
    }

    if (sections.length === 0) {
      for (const link of links) {
        link.addEventListener("pointerdown", (event) => {
          if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            !isLandingSectionLink(link)
          ) {
            return;
          }

          event.preventDefault();
          navigateToLandingSection(link);
        });

        link.addEventListener("click", (event) => {
          if (isLandingSectionLink(link)) {
            event.preventDefault();
            navigateToLandingSection(link);
          }
        });
      }

      return;
    }

    function updateIndicator() {
      indicatorFrame = 0;
      const activeLink = nav.querySelector(`[data-section-id="${activeId}"]`);

      if (!(activeLink instanceof HTMLElement)) {
        nav.classList.remove("has-indicator");
        return;
      }

      const navRect = nav.getBoundingClientRect();
      const linkRect = activeLink.getBoundingClientRect();

      nav.style.setProperty("--nav-indicator-width", `${Math.round(linkRect.width)}px`);
      nav.style.setProperty("--nav-indicator-x", `${Math.round(linkRect.left - navRect.left)}px`);
      nav.classList.add("has-indicator");
    }

    function scheduleIndicatorUpdate() {
      if (!indicatorFrame) {
        indicatorFrame = window.requestAnimationFrame(updateIndicator);
      }
    }

    function setActiveSection(id) {
      if (id === activeId) {
        scheduleIndicatorUpdate();
        return;
      }

      activeId = id;

      for (const link of links) {
        const isActive = link.dataset.sectionId === id;
        link.classList.toggle("active", isActive);

        if (isActive) {
          link.setAttribute("aria-current", "true");
        } else {
          link.removeAttribute("aria-current");
        }
      }

      scheduleIndicatorUpdate();
    }

    function updateActiveSection() {
      activeFrame = 0;

      const focusLine = window.innerHeight * 0.42;
      let closestId = "";
      let closestDistance = Infinity;
      let closestIsInView = false;

      for (const section of sections) {
        const rect = section.getBoundingClientRect();
        const sectionCenter = rect.top + rect.height / 2;
        const isInView = rect.top <= focusLine && rect.bottom >= focusLine;
        const distance = Math.abs(sectionCenter - focusLine);

        if (
          !closestId ||
          (isInView && !closestIsInView) ||
          (isInView === closestIsInView && distance < closestDistance)
        ) {
          closestId = section.dataset.navSection || section.id;
          closestDistance = distance;
          closestIsInView = isInView;
        }
      }

      if (closestId && closestIsInView) {
        setActiveSection(closestId);
      } else {
        setActiveSection("");
      }
    }

    function scheduleActiveUpdate() {
      if (!activeFrame) {
        activeFrame = window.requestAnimationFrame(updateActiveSection);
      }
    }

    function requestedSectionId() {
      if (window.location.hash) {
        return decodeURIComponent(window.location.hash.slice(1));
      }

      const sectionParam = new URLSearchParams(window.location.search).get("section");
      if (sectionParam) {
        return sectionParam;
      }

      return readPendingSection();
    }

    function sectionTargetFromRequest() {
      const id = requestedSectionId();
      if (!id) {
        return null;
      }

      return sections.find((section) => section.id === id) || null;
    }

    function alignInitialHashScroll() {
      if (initialAlignmentCancelled) {
        return;
      }

      const target = sectionTargetFromRequest();
      if (!target) {
        return;
      }

      const top = sectionScrollTop(target);
      scrollInstant(top);
      if (!window.location.hash) {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("section");
        window.history.replaceState(null, "", `${cleanUrl.pathname}${cleanUrl.search}#${target.id}`);
      }
      clearPendingSection();
      scheduleActiveUpdate();
    }

    function scheduleInitialHashAlignment() {
      if (!sectionTargetFromRequest()) {
        return;
      }

      initialAlignmentCancelled = false;

      window.requestAnimationFrame(() => {
        alignInitialHashScroll();
        window.requestAnimationFrame(alignInitialHashScroll);
      });

      [80, 220].forEach((delay) => {
        window.setTimeout(alignInitialHashScroll, delay);
      });
    }

    function cancelInitialHashAlignment() {
      initialAlignmentCancelled = true;
    }

    function animateScrollTo(top, anchor, target) {
      window.cancelAnimationFrame(scrollAnimationFrame);

      function finishScroll() {
        if (!target && Math.abs(window.scrollY - top) > 1) {
          scrollInstant(top);
        }

        pushHash(anchor);
        scheduleActiveUpdate();
      }

      if (prefersReducedMotion()) {
        scrollInstant(target ? sectionScrollTop(target) : top);
        finishScroll();
        return;
      }

      const initialY = window.scrollY;
      const distance = top - initialY;

      if (Math.abs(distance) < 1) {
        finishScroll();
        return;
      }

      const duration = Math.min(Math.max(Math.abs(distance) * 0.22, 520), 1100);
      const startTime = performance.now();

      function step(time) {
        const progress = Math.min((time - startTime) / duration, 1);
        const easedProgress =
          progress < 0.5 ? 4 * progress ** 3 : 1 - ((-2 * progress + 2) ** 3) / 2;
        const nextY = initialY + distance * easedProgress;

        scrollInstant(nextY);

        if (progress < 1) {
          scrollAnimationFrame = window.requestAnimationFrame(step);
        } else {
          finishScroll();
        }
      }

      scrollAnimationFrame = window.requestAnimationFrame(step);
    }

    function scrollToSection(target, link) {
      cancelInitialHashAlignment();
      window.requestAnimationFrame(() => {
        animateScrollTo(sectionScrollTop(target), link, target);
      });
    }

    for (const link of links) {
      link.addEventListener("pointerdown", (event) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }

        const target = document.getElementById(link.dataset.sectionId || "");
        if (!target) {
          if (isLandingSectionLink(link)) {
            savePendingSection(link.dataset.sectionId || "");
            event.preventDefault();
            window.location.assign(`${link.pathname}${link.search}`);
          }

          return;
        }

        event.preventDefault();
        handledSectionLinks.add(link);
        scrollToSection(target, link);
      });

      link.addEventListener("click", (event) => {
        const target = document.getElementById(link.dataset.sectionId || "");
        if (target) {
          event.preventDefault();
          if (handledSectionLinks.has(link)) {
            handledSectionLinks.delete(link);
            return;
          }

          scrollToSection(target, link);
          return;
        }

        if (isLandingSectionLink(link)) {
          savePendingSection(link.dataset.sectionId || "");
        }
      });
    }

    updateActiveSection();
    scheduleInitialHashAlignment();
    window.setTimeout(scheduleIndicatorUpdate, 120);
    window.addEventListener("scroll", scheduleActiveUpdate, { passive: true });
    window.addEventListener("resize", scheduleActiveUpdate);
    window.addEventListener("resize", scheduleIndicatorUpdate);
    window.addEventListener("load", scheduleInitialHashAlignment);
    window.addEventListener("hashchange", scheduleInitialHashAlignment);
    window.addEventListener("focus", scheduleActiveUpdate);
    window.addEventListener("wheel", cancelInitialHashAlignment, { passive: true });
    window.addEventListener("touchstart", cancelInitialHashAlignment, { passive: true });
    window.addEventListener("keydown", cancelInitialHashAlignment);
    window.addEventListener("pageshow", () => {
      scheduleActiveUpdate();
      scheduleInitialHashAlignment();
    });
    window.addEventListener("pagehide", () => {
      window.cancelAnimationFrame(activeFrame);
      window.cancelAnimationFrame(indicatorFrame);
      window.cancelAnimationFrame(scrollAnimationFrame);
    });
  }

  function initRevealMotion() {
    let revealElements = Array.from(document.querySelectorAll("[data-reveal-section], [data-reveal-item]"));

    if (revealElements.length === 0) {
      return;
    }

    if (prefersReducedMotion()) {
      for (const element of revealElements) {
        element.classList.add("is-visible");
      }
      return;
    }

    root.classList.add("motion-ready");

    let frame = 0;

    function revealVisibleSections() {
      frame = 0;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

      revealElements = revealElements.filter((element) => {
        if (element.classList.contains("is-visible")) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        const isItem = element.hasAttribute("data-reveal-item");
        const topTrigger = viewportHeight * (isItem ? 0.72 : 0.54);
        const bottomTrigger = viewportHeight * (isItem ? 0.14 : 0.28);
        const isVisibleEnough = rect.top <= topTrigger && rect.bottom >= bottomTrigger;

        if (isVisibleEnough) {
          element.classList.add("is-visible");
          return false;
        }

        return true;
      });

      if (revealElements.length === 0) {
        window.removeEventListener("scroll", scheduleRevealCheck);
        window.removeEventListener("resize", scheduleRevealCheck);
        window.removeEventListener("focus", scheduleRevealCheck);
        window.removeEventListener("pageshow", scheduleRevealCheck);
        window.removeEventListener("hashchange", scheduleRevealCheck);
      }
    }

    function scheduleRevealCheck() {
      if (!frame) {
        frame = window.requestAnimationFrame(revealVisibleSections);
      }
    }

    scheduleRevealCheck();
    window.setTimeout(scheduleRevealCheck, 120);
    window.addEventListener("scroll", scheduleRevealCheck, { passive: true });
    window.addEventListener("resize", scheduleRevealCheck);
    window.addEventListener("focus", scheduleRevealCheck);
    window.addEventListener("pageshow", scheduleRevealCheck);
    window.addEventListener("hashchange", scheduleRevealCheck);
  }

  function initFormatSearch() {
    const searchRoot = document.querySelector("[data-format-search]");
    if (!searchRoot) {
      return;
    }

    const input = searchRoot.querySelector("[data-format-search-input]");
    const count = searchRoot.querySelector("[data-format-search-count]");
    const emptyRow = searchRoot.querySelector("[data-format-empty-row]");
    const rows = Array.from(searchRoot.querySelectorAll("[data-format-row]")).map((row) => ({
      chips: Array.from(row.querySelectorAll("[data-format-chip]")),
      row
    }));
    let frame = 0;
    let lastQuery = "";

    if (!(input instanceof HTMLInputElement) || !count) {
      return;
    }

    function formatCount(value) {
      const plural = value > 1 ? "s" : "";
      return `${value} format${plural} found`;
    }

    function updateSearch() {
      frame = 0;

      const query = input.value.trim().toLowerCase();
      if (query === lastQuery) {
        return;
      }

      lastQuery = query;
      let visibleRows = 0;
      let matchingFormats = 0;

      searchRoot.setAttribute("data-search-active", query ? "true" : "false");

      for (const entry of rows) {
        const matches = [];
        const others = [];

        for (const chip of entry.chips) {
          const isMatch = Boolean(query && (chip.dataset.formatNormalized || "").includes(query));
          chip.classList.toggle("match", isMatch);

          if (isMatch) {
            matches.push(chip);
          } else {
            others.push(chip);
          }
        }

        const orderedChips = query
          ? [...matches, ...others]
          : [...entry.chips].sort(
              (a, b) => Number(a.dataset.formatIndex || 0) - Number(b.dataset.formatIndex || 0)
            );

        const chipList = orderedChips[0]?.parentElement;
        orderedChips.forEach((chip, index) => {
          chip.style.setProperty("--format-index", String(Math.min(index, 10)));
          chipList?.appendChild(chip);
        });

        const rowVisible = !query || matches.length > 0;
        entry.row.toggleAttribute("hidden", !rowVisible);

        if (rowVisible) {
          visibleRows += 1;
          matchingFormats += matches.length;
        }
      }

      count.textContent = query ? formatCount(matchingFormats) : `${rows.length} categories shown`;
      emptyRow?.toggleAttribute("hidden", visibleRows > 0);
    }

    function scheduleUpdate() {
      if (!frame) {
        frame = window.requestAnimationFrame(updateSearch);
      }
    }

    input.addEventListener("input", scheduleUpdate);
  }

  function initImagePreview() {
    let activeBackdrop = null;
    let activeTrigger = null;
    let previousOverflow = "";

    function closePreview() {
      if (!activeBackdrop) {
        return;
      }

      activeBackdrop.remove();
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);

      if (activeTrigger) {
        activeTrigger.setAttribute("aria-expanded", "false");
        activeTrigger.removeAttribute("aria-controls");
        activeTrigger.focus({ preventScroll: true });
      }

      activeBackdrop = null;
      activeTrigger = null;
    }

    function onKeyDown(event) {
      if (event.key === "Escape") {
        closePreview();
      }
    }

    document.addEventListener("click", (event) => {
      const trigger = closestElement(event.target, "[data-image-preview]");
      if (!(trigger instanceof HTMLButtonElement)) {
        return;
      }

      const sourcePicture = trigger.querySelector("picture");
      const sourceImage = trigger.querySelector("img");
      if (!sourceImage) {
        return;
      }

      closePreview();

      const dialogId = `image-preview-${Date.now().toString(36)}`;
      const picture = sourcePicture ? sourcePicture.cloneNode(true) : sourceImage.cloneNode(true);
      const previewImage = picture instanceof HTMLImageElement ? picture : picture.querySelector("img");

      if (previewImage) {
        previewImage.removeAttribute("loading");
        previewImage.setAttribute("decoding", "async");
      }

      const backdrop = document.createElement("div");
      backdrop.className = "image-preview-backdrop";
      backdrop.setAttribute("role", "presentation");

      const dialog = document.createElement("div");
      dialog.id = dialogId;
      dialog.className = "image-preview-dialog";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-label", `Enlarged preview: ${sourceImage.alt}`);
      dialog.tabIndex = -1;

      const frame = document.createElement("div");
      frame.className = "image-preview-frame";
      frame.setAttribute("style", trigger.getAttribute("style") || "");
      frame.appendChild(picture);
      dialog.appendChild(frame);
      backdrop.appendChild(dialog);

      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      document.body.appendChild(backdrop);

      activeBackdrop = backdrop;
      activeTrigger = trigger;
      trigger.setAttribute("aria-expanded", "true");
      trigger.setAttribute("aria-controls", dialogId);

      backdrop.addEventListener("click", closePreview);
      dialog.addEventListener("click", (dialogEvent) => dialogEvent.stopPropagation());
      window.addEventListener("keydown", onKeyDown);
      dialog.focus();
    });
  }

  function initLatestRelease() {
    const releaseCards = Array.from(document.querySelectorAll("[data-latest-release]"));
    const downloadButtons = Array.from(document.querySelectorAll("[data-windows-download]"));
    const versionBadges = Array.from(document.querySelectorAll("[data-latest-version]"));

    if (releaseCards.length === 0 && downloadButtons.length === 0 && versionBadges.length === 0) {
      return;
    }

    const source = releaseCards[0] || downloadButtons[0] || versionBadges[0];
    const apiUrl = source?.dataset.apiUrl || "";
    const releasesUrl = source?.dataset.releasesUrl || "";

    if (!apiUrl || !releasesUrl) {
      return;
    }

    let started = false;

    function setErrorState() {
      for (const card of releaseCards) {
        card.querySelector("[data-release-name]").textContent = "Latest release";
        card.querySelector("[data-release-title]").textContent = "Unable to read the current version right now.";
        card.querySelector("[data-release-date]").textContent = "Unable to read the release right now.";
        card.querySelector("[data-release-asset]")?.toggleAttribute("hidden", true);
      }

      for (const badge of versionBadges) {
        badge.setAttribute("href", releasesUrl);
        badge.querySelector("[data-version-state]").textContent = "Latest";
        badge.querySelector("[data-version-label]").textContent = "GitHub";
      }

      for (const button of downloadButtons) {
        button.removeAttribute("aria-busy");
        button.removeAttribute("download");
        button.setAttribute("href", releasesUrl);
        button.querySelector("[data-download-label]").textContent = "View the Windows release";
      }
    }

    function formatDate(value) {
      return new Intl.DateTimeFormat("en-US", {
        day: "2-digit",
        month: "long",
        year: "numeric"
      }).format(new Date(value));
    }

    function preferredWindowsAsset(assets) {
      return assets
        ?.filter((asset) => asset.name?.toLowerCase().endsWith(".exe") && asset.browser_download_url)
        .sort((a, b) => {
          const aName = a.name?.toLowerCase() || "";
          const bName = b.name?.toLowerCase() || "";
          const aScore = Number(aName.includes("setup") || aName.includes("installer")) + Number(aName.includes("x64"));
          const bScore = Number(bName.includes("setup") || bName.includes("installer")) + Number(bName.includes("x64"));
          return bScore - aScore;
        })[0];
    }

    async function loadLatestRelease() {
      if (started) {
        return;
      }

      started = true;

      try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 7000);
        const response = await fetch(apiUrl, {
          headers: { Accept: "application/vnd.github+json" },
          signal: controller.signal
        }).finally(() => window.clearTimeout(timeout));

        if (!response.ok) {
          throw new Error("GitHub release request failed");
        }

        const data = await response.json();
        if (!data.tag_name || !data.published_at) {
          throw new Error("GitHub release payload incomplete");
        }

        const asset = preferredWindowsAsset(data.assets);
        const releaseUrl = data.html_url || releasesUrl;

        for (const card of releaseCards) {
          const assetLine = card.querySelector("[data-release-asset]");
          card.querySelector("[data-release-name]").textContent = data.tag_name;
          card.querySelector("[data-release-title]").textContent =
            data.name && data.name !== data.tag_name ? `Release: ${data.name}` : "Latest GitHub release";
          card.querySelector("[data-release-date]").textContent = `Published on ${formatDate(data.published_at)}`;
          card.querySelector("[data-release-link]").setAttribute("href", releaseUrl);
          card.querySelector("[data-release-link]").textContent = "Release notes";

          if (asset?.name) {
            assetLine.textContent = `Windows installer: ${asset.name}`;
            assetLine.hidden = false;
          } else {
            assetLine.hidden = true;
          }
        }

        for (const badge of versionBadges) {
          badge.setAttribute("href", releaseUrl);
          badge.querySelector("[data-version-state]").textContent = "Latest";
          badge.querySelector("[data-version-label]").textContent = data.tag_name;
        }

        for (const button of downloadButtons) {
          button.removeAttribute("aria-busy");

          if (asset?.name && asset.browser_download_url) {
            button.setAttribute("href", asset.browser_download_url);
            button.setAttribute("download", asset.name);
            button.querySelector("[data-download-label]").textContent = "Download for Windows";
          } else {
            button.removeAttribute("download");
            button.setAttribute("href", releaseUrl);
            button.querySelector("[data-download-label]").textContent = "View the Windows release";
          }
        }
      } catch {
        setErrorState();
      }
    }

    const downloadSection = document.getElementById("download");
    if ("IntersectionObserver" in window && downloadSection) {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer.disconnect();
            loadLatestRelease();
          }
        },
        { rootMargin: "220px 0px" }
      );
      observer.observe(downloadSection);
    }

    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(loadLatestRelease, { timeout: 4200 });
    } else {
      window.setTimeout(loadLatestRelease, 2400);
    }
  }

  function initInteractiveBackground() {
    const canvas = document.querySelector("[data-interactive-background]");
    if (!(canvas instanceof HTMLCanvasElement)) {
      return;
    }

    const context = canvas.getContext("2d", { alpha: true, desynchronized: true });
    if (!context) {
      return;
    }

    const desktopPointerQuery = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 1121px)");
    let motionReduced = prefersReducedMotion();
    let pointerEffectAvailable = !motionReduced && desktopPointerQuery.matches;
    let gridAnimationAvailable = !motionReduced;
    const styles = window.getComputedStyle(document.documentElement);
    const gridGreen = styles.getPropertyValue("--grid-green").trim() || "rgba(61, 123, 103, 0.052)";
    const gridOrange = styles.getPropertyValue("--grid-orange").trim() || "rgba(196, 111, 58, 0.04)";
    const accent = styles.getPropertyValue("--accent").trim() || "#3f7664";
    const brand = styles.getPropertyValue("--brand").trim() || "#c46f3a";
    const pointer = {
      active: false,
      previousSmoothX: window.innerWidth / 2,
      previousSmoothY: window.innerHeight / 2,
      smoothX: window.innerWidth / 2,
      smoothY: window.innerHeight / 2,
      strength: 0,
      velocityX: 0,
      velocityY: 0,
      x: window.innerWidth / 2,
      y: window.innerHeight / 2
    };
    let points = [];
    let animationFrame = 0;
    let resizeFrame = 0;
    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let isRunning = false;
    let hasPointerListeners = false;
    let distortedX = 0;
    let distortedY = 0;

    function canRunPointerEffect() {
      return pointerEffectAvailable;
    }

    function canAnimateGrid() {
      return gridAnimationAvailable;
    }

    function updateMotionState() {
      motionReduced = prefersReducedMotion();
      pointerEffectAvailable = !motionReduced && desktopPointerQuery.matches;
      gridAnimationAvailable = !motionReduced;
    }

    function buildPoints() {
      points = [];
      const spacing = width < 760 ? 54 : 46;
      const cols = Math.ceil(width / spacing) + 2;
      const rows = Math.ceil(height / spacing) + 2;

      for (let y = -1; y < rows; y += 1) {
        for (let x = -1; x < cols; x += 1) {
          points.push({
            phase: (x * 0.7 + y * 0.45) % Math.PI,
            x: x * spacing,
            y: y * spacing
          });
        }
      }
    }

    function resize() {
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      buildPoints();
    }

    function scheduleResize() {
      if (resizeFrame) {
        return;
      }

      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = 0;
        resize();

        if (!canAnimateGrid()) {
          draw(0);
        }
      });
    }

    function draw(time) {
      const pointerEffectEnabled = pointerEffectAvailable;

      if (gridAnimationAvailable && document.hidden) {
        isRunning = false;
        return;
      }

      context.clearRect(0, 0, width, height);

      pointer.smoothX += (pointer.x - pointer.smoothX) * 0.09;
      pointer.smoothY += (pointer.y - pointer.smoothY) * 0.09;
      pointer.velocityX += (pointer.smoothX - pointer.previousSmoothX - pointer.velocityX) * 0.18;
      pointer.velocityY += (pointer.smoothY - pointer.previousSmoothY - pointer.velocityY) * 0.18;
      pointer.previousSmoothX = pointer.smoothX;
      pointer.previousSmoothY = pointer.smoothY;
      pointer.strength += ((pointerEffectEnabled && pointer.active ? 1 : 0) - pointer.strength) * 0.07;

      const seconds = time * 0.001;
      const influence = 225 * pointer.strength;
      const gridSpacing = width < 760 ? 54 : 46;
      const sample = 16;
      const driftX = (seconds * 7.2) % gridSpacing;
      const driftY = (seconds * 4.6) % gridSpacing;
      const pointerSpeed = Math.min(1, Math.hypot(pointer.velocityX, pointer.velocityY) / 18);
      const pulse = 0.5 + Math.sin(seconds * 1.35) * 0.5;

      function distortPoint(x, y) {
        const waveX = Math.sin(seconds * 0.72 + y * 0.019 + x * 0.003) * 3.2;
        const waveY = Math.cos(seconds * 0.64 + x * 0.019 + y * 0.003) * 2.9;
        const dx = x - pointer.smoothX;
        const dy = y - pointer.smoothY;
        const distance = Math.hypot(dx, dy);
        const force = influence > 0 && distance < influence ? (1 - distance / influence) ** 2 : 0;
        const ripple = Math.sin(distance * 0.05 - seconds * 5.8) * force * (8 + pointerSpeed * 10) * pointer.strength;
        const pull = Math.sin((1 - force) * Math.PI) * force * (22 + pulse * 7) * pointer.strength;
        const twist = force * (0.12 + pointerSpeed * 0.09) * pointer.strength;
        const velocityDragX = pointer.velocityX * force * 0.72;
        const velocityDragY = pointer.velocityY * force * 0.72;

        distortedX =
          x + waveX + dx * twist - dy * twist + velocityDragX + (distance > 0 ? (dx / distance) * (pull + ripple) : 0);
        distortedY =
          y + waveY + dy * twist + dx * twist + velocityDragY + (distance > 0 ? (dy / distance) * (pull + ripple) : 0);
      }

      if (pointer.strength > 0.04) {
        const haloRadius = 172 + pointerSpeed * 32 + Math.sin(seconds * 2.1) * 6;
        const halo = context.createRadialGradient(pointer.smoothX, pointer.smoothY, 0, pointer.smoothX, pointer.smoothY, haloRadius);

        halo.addColorStop(0, `rgba(196, 111, 58, ${0.045 * pointer.strength})`);
        halo.addColorStop(0.42, `rgba(63, 118, 100, ${(0.026 + pointerSpeed * 0.018) * pointer.strength})`);
        halo.addColorStop(1, "rgba(196, 111, 58, 0)");

        context.fillStyle = halo;
        context.fillRect(0, 0, width, height);
      }

      context.lineWidth = 1;

      for (let y = -gridSpacing * 2 + driftY; y <= height + gridSpacing * 2; y += gridSpacing) {
        context.strokeStyle = gridGreen;
        context.globalAlpha = 0.88 + pulse * 0.12;
        context.beginPath();

        let isFirstPoint = true;
        for (let x = -gridSpacing * 2 + driftX; x <= width + gridSpacing * 2; x += sample) {
          distortPoint(x, y);
          if (isFirstPoint) {
            context.moveTo(distortedX, distortedY);
            isFirstPoint = false;
          } else {
            context.lineTo(distortedX, distortedY);
          }
        }

        context.stroke();
      }

      for (let x = -gridSpacing * 2 + driftX; x <= width + gridSpacing * 2; x += gridSpacing) {
        context.strokeStyle = gridOrange;
        context.globalAlpha = 0.78 + pulse * 0.14;
        context.beginPath();

        let isFirstPoint = true;
        for (let y = -gridSpacing * 2 + driftY; y <= height + gridSpacing * 2; y += sample) {
          distortPoint(x, y);
          if (isFirstPoint) {
            context.moveTo(distortedX, distortedY);
            isFirstPoint = false;
          } else {
            context.lineTo(distortedX, distortedY);
          }
        }

        context.stroke();
      }

      context.globalAlpha = 1;

      for (const point of points) {
        const animatedX = point.x + driftX;
        const animatedY = point.y + driftY;
        const waveX = Math.sin(seconds * 0.82 + point.phase) * 2.8;
        const waveY = Math.cos(seconds * 0.7 + point.phase) * 2.5;
        const dx = animatedX - pointer.smoothX;
        const dy = animatedY - pointer.smoothY;
        const distance = Math.hypot(dx, dy);
        const force = influence > 0 && distance < influence ? (1 - distance / influence) ** 2 : 0;
        const pushX = distance > 0 ? (dx / distance) * force * (16 + pointerSpeed * 12) * pointer.strength : 0;
        const pushY = distance > 0 ? (dy / distance) * force * (16 + pointerSpeed * 12) * pointer.strength : 0;
        const x = animatedX + waveX + pushX + pointer.velocityX * force * 0.55;
        const y = animatedY + waveY + pushY + pointer.velocityY * force * 0.55;
        const alpha = 0.075 + pulse * 0.025 + force * 0.24;
        const size = 1 + pulse * 0.25 + force * 2.1;

        context.fillStyle = accent;
        context.globalAlpha = alpha;
        context.fillRect(x - size / 2, y - size / 2, size, size);
        context.globalAlpha = 1;

        if (force > 0.08) {
          context.strokeStyle = brand;
          context.globalAlpha = force * 0.08;
          context.beginPath();
          context.moveTo(x - 9, y);
          context.lineTo(x + 9, y);
          context.moveTo(x, y - 9);
          context.lineTo(x, y + 9);
          context.stroke();
          context.globalAlpha = 1;
        }
      }

      if (gridAnimationAvailable && isRunning) {
        animationFrame = window.requestAnimationFrame(draw);
      }
    }

    function startAnimation() {
      if (!gridAnimationAvailable || isRunning) {
        return;
      }

      isRunning = true;
      animationFrame = window.requestAnimationFrame(draw);
    }

    function restartCanvas() {
      window.cancelAnimationFrame(animationFrame);
      updateMotionState();
      resize();

      if (!gridAnimationAvailable) {
        pointer.active = false;
        isRunning = false;
        draw(0);
        return;
      }

      if (!pointerEffectAvailable) {
        pointer.active = false;
      }

      isRunning = false;
      startAnimation();
    }

    function onPointerMove(event) {
      if (!pointerEffectAvailable) {
        return;
      }

      pointer.active = true;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    }

    function onPointerLeave() {
      pointer.active = false;
    }

    function addPointerListeners() {
      if (hasPointerListeners || !pointerEffectAvailable) {
        return;
      }

      hasPointerListeners = true;
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("pointerleave", onPointerLeave);
    }

    function removePointerListeners() {
      if (!hasPointerListeners) {
        return;
      }

      hasPointerListeners = false;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
    }

    function onDesktopPointerChange() {
      updateMotionState();

      if (pointerEffectAvailable) {
        addPointerListeners();
      } else {
        removePointerListeners();
      }

      restartCanvas();
    }

    function onVisibilityChange() {
      if (document.hidden) {
        isRunning = false;
        window.cancelAnimationFrame(animationFrame);
      } else {
        restartCanvas();
      }
    }

    resize();
    addPointerListeners();

    if (canAnimateGrid()) {
      startAnimation();
    } else {
      draw(0);
    }

    window.addEventListener("resize", scheduleResize);
    window.addEventListener("focus", restartCanvas);
    window.addEventListener("pageshow", restartCanvas);
    document.addEventListener("visibilitychange", onVisibilityChange);
    desktopPointerQuery.addEventListener("change", onDesktopPointerChange);
    reducedMotionQuery.addEventListener("change", restartCanvas);
  }

  initSmoothAnchors();
  initSectionNav();
  initRevealMotion();
  initFormatSearch();
  initImagePreview();
  initLatestRelease();
  initInteractiveBackground();
})();
