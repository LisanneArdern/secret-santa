import Link from "next/link";

// SPEC.md: "Navigation is minimal: a logo linking home and an account
// menu, no sidebar." The account menu lands once sign-out exists.
export function SiteHeader() {
  return (
    <header className="site-header">
      <Link href="/" className="site-header__logo">
        <span aria-hidden="true">❄</span> Santa Swap
      </Link>
    </header>
  );
}
