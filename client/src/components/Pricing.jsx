import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "For creators just getting started.",
    features: [
      "5 thumbnail analyses per month",
      "Basic composition feedback",
      "CTR score predictions",
      "Community support",
    ],
    cta: "Get Started",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$12",
    period: "per month",
    description: "For serious creators who want an edge.",
    features: [
      "Unlimited thumbnail analyses",
      "AI design suggestions",
      "A/B testing tools",
      "Competitor tracking",
      "Priority support",
    ],
    cta: "Start Free Trial",
    highlighted: true,
  },
  {
    name: "Team",
    price: "$29",
    period: "per month",
    description: "For agencies and content teams.",
    features: [
      "Everything in Pro",
      "5 team members included",
      "Brand guidelines enforcement",
      "Analytics dashboard",
      "API access",
    ],
    cta: "Contact Sales",
    highlighted: false,
  },
];

function Pricing() {
  return (
    <section className="relative py-24 sm:py-32 px-6" id="pricing">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.4 }}
          className="text-center mb-14"
        >
          <p className="text-[13px] text-[#737380] font-medium uppercase tracking-widest mb-3">
            Pricing
          </p>
          <h2 className="font-heading text-2xl sm:text-3xl font-semibold text-white tracking-[-0.01em]">
            Simple, transparent pricing
          </h2>
        </motion.div>

        {/* Plans */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className={`relative p-6 rounded-xl border ${
                plan.highlighted
                  ? "border-white/[0.12] bg-[#111118]"
                  : "border-white/6 bg-[#0e0e16]"
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-white text-[#0a0a0f] text-[11px] font-medium">
                  Popular
                </div>
              )}

              <div className="mb-5">
                <h3 className="font-heading text-[15px] font-medium text-white">
                  {plan.name}
                </h3>
                <p className="text-[13px] text-[#737380] mt-1">
                  {plan.description}
                </p>
              </div>

              <div className="flex items-baseline gap-1 mb-6">
                <span className="font-heading text-3xl font-semibold text-white">
                  {plan.price}
                </span>
                <span className="text-[13px] text-[#737380]">
                  /{plan.period}
                </span>
              </div>

              <ul className="flex flex-col gap-2.5 mb-6">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 text-[13px] text-[#737380]"
                  >
                    <Check className="w-3.5 h-3.5 text-[#737380] mt-0.5 shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Button
                className={`w-full text-[13px] font-medium h-9 ${
                  plan.highlighted
                    ? "bg-white text-[#0a0a0f] hover:bg-white/90"
                    : "bg-white/[0.05] text-[#737380] hover:text-white hover:bg-white/[0.08] border border-white/6"
                }`}
              >
                {plan.cta}
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Pricing;
