      (function () {
        const menuToggle = document.getElementById("menuToggle");
        const sidebar = document.getElementById("sidebar");
        const backdrop = document.getElementById("backdrop");

        if (menuToggle && sidebar && backdrop) {
          function openSidebar() {
            sidebar.classList.remove("-translate-x-full");
            backdrop.classList.remove("hidden");
            document.body.style.overflow = "hidden";
          }
          function closeSidebar() {
            sidebar.classList.add("-translate-x-full");
            backdrop.classList.add("hidden");
            document.body.style.overflow = "";
          }

          menuToggle.addEventListener("click", openSidebar);
          backdrop.addEventListener("click", closeSidebar);

          // optional: close on escape
          window.addEventListener("keydown", (e) => {
            if (
              e.key === "Escape" &&
              !sidebar.classList.contains("-translate-x-full")
            ) {
              closeSidebar();
            }
          });

          // on window resize above lg, reset sidebar to visible and remove backdrop
          window.addEventListener("resize", function () {
            if (window.innerWidth >= 1024) {
              // lg breakpoint
              sidebar.classList.remove("-translate-x-full");
              backdrop.classList.add("hidden");
              document.body.style.overflow = "";
            } else {
              // when going below lg, we ensure sidebar is hidden (unless manually opened)
              // but we don't auto-close if it's open? simpler: always hide below lg unless toggled.
              // better: on resize to mobile, hide sidebar and backdrop.
              if (!sidebar.classList.contains("-translate-x-full")) {
                // if it's open and we cross to mobile, we keep it open? let's force closed to avoid overlap.
                // more robust: close when crossing to mobile
                sidebar.classList.add("-translate-x-full");
                backdrop.classList.add("hidden");
                document.body.style.overflow = "";
              }
            }
          });
        }
      })();