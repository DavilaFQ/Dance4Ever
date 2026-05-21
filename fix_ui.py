import re

with open("app/register/[eventId]/page.tsx", "r") as f:
    content = f.read()

# 1. Update NextButton signature and body
content = re.sub(
    r'function NextButton\(\{ onClick, disabled, label \}: \{ onClick: \(\) => void, disabled\?: boolean, label\?: string \}\) \{.*?\n\s*<button\n\s*onClick=\{onClick\}\n\s*disabled=\{disabled\}\n\s*className="w-full bg-gradient-to-r from-\[#16A34A\] via-\[#82f606\] to-\[#fff200\] hover:brightness-105 active:brightness-95 text-white font-display text-xl lg:text-2xl tracking-widest py-4 lg:py-5 rounded-2xl disabled:opacity-40 disabled:pointer-events-none transition-all shadow-md active:scale-\[0.98\] duration-150"\n\s*>',
    r'''function NextButton({ onClick, disabled, label, isKeyboardOpen }: { onClick: () => void, disabled?: boolean, label?: string, isKeyboardOpen?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full bg-gradient-to-r from-[#16A34A] via-[#82f606] to-[#fff200] hover:brightness-105 active:brightness-95 text-[rgb(var(--c-text-strong))] font-display tracking-widest rounded-2xl disabled:opacity-40 disabled:pointer-events-none transition-all shadow-md active:scale-[0.98] duration-150 ${isKeyboardOpen ? 'py-3 text-lg' : 'py-4 lg:py-5 text-xl lg:text-2xl'}`}
    >''',
    content,
    flags=re.DOTALL
)

# 2. Add isKeyboardOpen to all <NextButton> calls
content = re.sub(r'<NextButton ', r'<NextButton isKeyboardOpen={isKeyboardOpen} ', content)
# Fix the one declaration of NextButton that might have been hit:
content = content.replace('function NextButton isKeyboardOpen={isKeyboardOpen}', 'function NextButton')

# 3. Update 'text-white' to 'text-[rgb(var(--c-text-strong))]' in gradients
# We can do this by regex for bg-gradient-to-r... text-white
content = re.sub(
    r'(bg-gradient-to-r from-\[#16A34A\] via-\[#82f606\] to-\[#fff200\].*?)text-white',
    r'\1text-[rgb(var(--c-text-strong))]',
    content
)

# 4. Fix Costs View TOTAL A PAGAR layout when keyboard is open
old_costs_total = r'''              \{valid && \(\n\s*<div className=\{`text-center bg-gradient-to-r from-\[#16A34A\] via-\[#82f606\] to-\[#fff200\] text-\[rgb\(var\(--c-text-strong\)\)\] rounded-2xl shadow-sm transition-all duration-150 \$\{isKeyboardOpen \? 'p-2\.5 mt-2\.5' : 'p-4 mt-4'\}`\}>\n\s*<p className=\{`font-display tracking-widest opacity-90 leading-none \$\{isKeyboardOpen \? 'text-\[10px\] mb-1' : 'text-xs lg:text-sm mb-1\.5'\}`\}>TOTAL A PAGAR</p>\n\s*<p className=\{`font-display leading-none \$\{isKeyboardOpen \? 'text-xl' : 'text-3xl lg:text-4xl'\}`\}>\{formatMoney\(total\)\}</p>\n\s*</div>\n\s*\)\}'''
new_costs_total = r'''              {valid && (
                <div className={`text-center bg-gradient-to-r from-[#16A34A] via-[#82f606] to-[#fff200] text-[rgb(var(--c-text-strong))] shadow-sm transition-all duration-150 flex ${isKeyboardOpen ? 'rounded-xl p-1.5 mt-1.5 flex-row justify-center items-center gap-2' : 'rounded-2xl p-4 mt-4 flex-col'}`}>
                  <p className={`font-display tracking-widest opacity-90 leading-none ${isKeyboardOpen ? 'text-[11px]' : 'text-xs lg:text-sm mb-1.5'}`}>TOTAL A PAGAR</p>
                  <p className={`font-display leading-none ${isKeyboardOpen ? 'text-lg' : 'text-3xl lg:text-4xl'}`}>{formatMoney(total)}</p>
                </div>
              )}'''
content = re.sub(old_costs_total, new_costs_total, content)

with open("app/register/[eventId]/page.tsx", "w") as f:
    f.write(content)
