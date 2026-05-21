import re

with open("app/register/[eventId]/page.tsx", "r") as f:
    content = f.read()

# Make the Welcome text more legible and less bold
content = content.replace(
    '<p className="font-sans text-xs tracking-widest text-[rgb(var(--c-primary))] font-medium">SISTEMA OFICIAL DE REGISTRO</p>',
    '<p className="font-sans text-xs tracking-widest text-[rgb(var(--c-primary))] font-normal">SISTEMA OFICIAL DE REGISTRO</p>'
)
content = content.replace(
    '<h2 className="font-sans text-3xl lg:text-4xl text-[rgb(var(--c-text-strong))] font-semibold tracking-tight">{event?.name || \'EVENTO\'}</h2>',
    '<h2 className="font-sans text-3xl lg:text-4xl text-[rgb(var(--c-text-strong))] font-normal tracking-tight">{event?.name || \'EVENTO\'}</h2>'
)
content = content.replace(
    '<p className="font-sans text-base lg:text-lg text-[rgb(var(--c-text))] font-normal">{eventCity} · {formatEventDate(event.date)}</p>',
    '<p className="font-sans text-lg lg:text-xl text-[rgb(var(--c-text-strong))] font-normal">{eventCity} · {formatEventDate(event.date)}</p>'
)
content = content.replace(
    '<p className="text-lg text-[rgb(var(--c-primary))] font-medium">{regDeadline}</p>',
    '<p className="text-lg text-[rgb(var(--c-primary))] font-normal">{regDeadline}</p>'
)
content = content.replace(
    '<p className="text-lg text-[rgb(var(--c-primary))] font-medium">{chgDeadline}</p>',
    '<p className="text-lg text-[rgb(var(--c-primary))] font-normal">{chgDeadline}</p>'
)

# Fix padding and gaps in Instruction Cards to remove dead space
content = content.replace(
    'className="flex flex-col w-full max-w-2xl mx-auto h-auto py-2 px-0 gap-3 lg:gap-6 my-auto lg:my-0"',
    'className="flex flex-col w-full max-w-2xl mx-auto h-auto py-2 px-0 gap-2 lg:gap-4 my-auto lg:my-0"'
)
content = content.replace(
    'p-3 lg:p-6 shadow-sm flex items-start gap-2.5 lg:gap-4',
    'p-2.5 lg:p-4 shadow-sm flex items-start gap-2 lg:gap-3'
)

with open("app/register/[eventId]/page.tsx", "w") as f:
    f.write(content)
