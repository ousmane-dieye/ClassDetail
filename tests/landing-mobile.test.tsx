import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import HomePage from "@/app/page";

const html = renderToStaticMarkup(<HomePage />);

describe("landing publique mobile first", () => {
  it("expose un bouton de menu accessible et un panneau contrôlé", () => {
    expect(html).toContain('data-mobile-menu-toggle="true"');
    expect(html).toContain('aria-controls="landing-mobile-menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Ouvrir le menu"');
    expect(html).toContain('id="landing-mobile-menu"');
    expect(html).toContain("Navigation mobile");
  });

  it("rend toutes les actions et les sections dans le panneau mobile", () => {
    for (const label of ["Bibliothèque", "Communauté", "Assistant", "Fonctionnement", "Se connecter", "Rejoindre"]) {
      expect(html).toContain(label);
    }
  });

  it("garde les ancres lisibles sous l'en-tête collant", () => {
    for (const id of ["bibliotheque", "communautes", "assistant", "fonctionnement"]) {
      expect(html).toContain(`id="${id}" class="scroll-mt-24`);
    }
  });

  it("sert les photos avec srcset/sizes au lieu d'une image unique en 1600 px", () => {
    expect(html).toContain("640w");
    expect(html).toContain("960w");
    expect(html).toContain("1600w");
    expect(html).toContain('sizes="(max-width: 1023px) calc(100vw - 2rem), 640px"');
  });
});
