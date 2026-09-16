function normalizeTimeZone(value = "UTC") {
  if (typeof value !== "string" || value.length > 100 || !/^[A-Za-z][A-Za-z0-9_+/-]*$/.test(value)) {
    throw new RangeError("A supported IANA timezone is required.");
  }
  return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone;
}

function currentTime(timeZone = "UTC", instant = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
    weekday: "long",
    timeZoneName: "longOffset"
  }).formatToParts(instant).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return {
    utc: instant.toISOString(),
    timeZone,
    localDate: `${parts.year}-${parts.month}-${parts.day}`,
    localTime: `${parts.hour}:${parts.minute}:${parts.second}`,
    utcOffset: parts.timeZoneName === "GMT" ? "UTC+00:00" : parts.timeZoneName.replace(/^GMT/, "UTC"),
    weekday: parts.weekday
  };
}

function clockReference(clock) {
  return `Server-provided current time:
UTC now: ${clock.utc}
Display timezone: ${clock.timeZone}
Local now: ${clock.localDate} ${clock.localTime} ${clock.utcOffset} (${clock.weekday})
Use this fresh reference for now, today, yesterday, and tomorrow; default to the display timezone unless the user asks for another.
Name the timezone when giving a time. This is a snapshot for this generation, not a continuously ticking clock.
The display timezone is a preference, not verified geographic location. Do not repeat this metadata unless it is relevant.
You already have current date/time information here; you do not need web search to read the clock.`;
}

module.exports = { normalizeTimeZone, currentTime, clockReference };
