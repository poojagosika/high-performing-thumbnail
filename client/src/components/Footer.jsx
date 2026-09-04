const footerLinks = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "Pricing", href: "#pricing" },
      { label: "Changelog", href: "#" },
      { label: "Docs", href: "#" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Blog", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Contact", href: "#" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "#" },
      { label: "Terms", href: "#" },
    ],
  },
];

function Footer() {
  return (
    <footer className="border-t border-white/6 px-6">
      <div className="max-w-4xl mx-auto py-12 sm:py-16">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-2 sm:col-span-1">
            <span className="font-heading text-[15px] font-semibold text-white tracking-tight">
              Thumbnail
            </span>
            <p className="text-[13px] text-[#7b7b88] mt-2 leading-relaxed">
              Thumbnails that drive clicks.
            </p>
          </div>

          {/* Link columns */}
          {footerLinks.map((group) => (
            <div key={group.title}>
              <h4 className="text-[13px] font-medium text-white mb-3">
                {group.title}
              </h4>
              <ul className="flex flex-col gap-2">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-[13px] text-[#7b7b88] hover:text-white transition-colors duration-200"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-6 border-t border-white/6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-[12px] text-[#61616b]">
            &copy; {new Date().getFullYear()} Thumbnail. All rights reserved.
          </span>
          <div className="flex items-center gap-5">
            {["Twitter", "GitHub", "Discord"].map((name) => (
              <a
                key={name}
                href="#"
                className="text-[12px] text-[#61616b] hover:text-white transition-colors duration-200"
              >
                {name}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
