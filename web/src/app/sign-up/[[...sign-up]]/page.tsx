import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-bg-app flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl btn-gradient flex items-center justify-center">
          <span
            className="material-symbols-outlined text-white text-[22px]"
            style={{ fontVariationSettings: "'FILL' 1,'wght' 500,'GRAD' 0,'opsz' 24" }}
          >
            mic
          </span>
        </div>
        <span className="text-[20px] font-bold text-text-pri tracking-tight">
          Rehearse
        </span>
      </div>

      <SignUp
        appearance={{
          elements: {
            card:            "bg-surface border border-border shadow-xl rounded-2xl",
            headerTitle:     "text-text-pri font-bold",
            headerSubtitle:  "text-text-sec",
            formButtonPrimary:
              "btn-gradient text-white font-semibold rounded-xl",
            footerActionLink: "text-blue hover:text-blue/80",
            formFieldInput:
              "bg-bg-app border-border text-text-pri rounded-xl focus:ring-blue focus:border-blue",
            formFieldLabel:  "text-text-sec text-[13px]",
            dividerLine:     "bg-border",
            dividerText:     "text-text-muted",
            socialButtonsBlockButton:
              "border-border bg-bg-app text-text-pri hover:bg-surface rounded-xl",
          },
        }}
      />
    </div>
  );
}
