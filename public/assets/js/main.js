(() => {
  const menuToggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector("#site-nav");

  if (menuToggle && nav) {
    menuToggle.addEventListener("click", () => {
      const expanded = menuToggle.getAttribute("aria-expanded") === "true";
      menuToggle.setAttribute("aria-expanded", String(!expanded));
      nav.classList.toggle("is-open", !expanded);
    });

    nav.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof HTMLAnchorElement && window.matchMedia("(max-width: 759px)").matches) {
        menuToggle.setAttribute("aria-expanded", "false");
        nav.classList.remove("is-open");
      }
    });
  }

  const yearElements = document.querySelectorAll(".js-year");
  const year = new Date().getFullYear();
  yearElements.forEach((element) => {
    element.textContent = String(year);
  });
})();
