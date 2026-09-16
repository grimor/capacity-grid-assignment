# Decisions

Yours to write, not your AI's. Short is good — bullets are fine, and half a page is
plenty. We read this first.

- Consumer is `CapacityGrid` component on `/web` directory. So the API response shape is based on what it displays.
- Added `@tanstack/react-query` library for handling API calls. That would be my state managment solution. It provides loading/error/cache state out-of-the box with additional goodies like caching.
- We can select any time range, API always return full week even if we pass ex. 3 days range.
- Rows that look like duplicates must be summed, not deduplicated
- Added virtualization for tables, to cut down the rendering time for displaying all 500 people.
- capacity is one `weeklyHours` per person, not repeated in every week. After a PATCH the client replaces that one number in every loaded range, with no refetch.

## What did the spec not tell you?

There are things this brief doesn't specify. Which ones did you hit, what did you decide,
and why?

- How weeks are defined, I use standard ISO weeks format. That's important to standarize weeks for like a year boundaries.
- There's no mention about timezone handling, I assume dates are in UTC for the simplicity.
- `weekly_hours` applies to every week on people schema, so editing the capacity also would be applied to past weeks.
- Does the weekends count to the capacity? Claude found that many assigments end on the weekends. I assumed we only count weekdays Mon-Fri.
- What PATCH accepts. I've limited that to 168 hours, and allowed fractions.

## What did you notice that looked wrong?

Anything in the output that didn't match what you expected. Whether you fixed it or left
it, we want to know you saw it.

- I saw different names if differnet languages, we should consider adding support for (right-to-left) layout. I've ignored it.
- hours_per_day looks like fractions (0.125–1.0), and 117k of the 126k assignment rows look like duplicates. Each assignment is actually split into 15 rows that add up to the real hours. Removing the duplicates, or reading the values as fractions, would give wrong totals.
- Eli has 0 capacity but 20h allocated, so a utilisation percentage can't be computed. That's why the API returns only raw hours.

## What did the AI get wrong that you caught?

One concrete example. Every real session has one.

- The proposed API model returned weeks an array and data about people's capacity was also in form of array that meant to be mapped to weeks array indexes. I've thought it could be error prone if arrays order won't be maintained. So I've proposed to rely on week start date and add this additonal field.

## What would you do differently with a week?

- More filtering options (ex. per name, capacity)
- Better layout and visual improvements
- Monitor SQL queries and look for improvments on aggregating the data
- Support for timezones
- Add better error handling, clear explanations
- Better test coverage
- Maybe keep the range in the URL.
- Add support for holidays and working weekends
- Optimize the response, maybe add pagination
