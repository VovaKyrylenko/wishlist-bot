#!/usr/bin/env bash
# A tiny mutation battery: proves the unit tests can fail.
#
# Coverage says which lines ran, not whether anything is asserted about them; a test
# with no assertions meets a coverage floor. So each class below breaks one rule the
# product depends on and demands that `npm test` goes red. Every survivor means a test
# is missing: add the test, never delete the mutant.
#
#   bash scripts/mutation-battery.sh <class>     classes: availability deeplink access
#                                                dates scrape-ipv4 ssrf
#
# A mutant that changes nothing exits 1 as well: a stale sed expression would otherwise
# "pass" by mutating nothing. The tree is copied to a temp dir, so the working copy is
# never touched.

set -euo pipefail

class="${1:-}"

# One mutant per line: <file><TAB><sed -E expression>. Write a literal ampersand as [&] in a
# pattern (\& means something different to GNU and BSD sed) and as \& in a replacement.
# The expression `@base` swaps in the file as it is on origin/main, i.e. the unfixed code.
mutants() {
  case "$1" in
    availability)
      printf '%s\t%s\n' \
        src/lib/availability.ts 's#\["ACTIVE", "PURCHASED"\]#["ACTIVE"]#' \
        src/lib/availability.ts 's#Math\.max\(quantity - reserved, 0\)#(quantity - reserved)#' \
        src/lib/availability.ts 's#reserved > 0 [&][&] available > 0#reserved > 0#'
      ;;
    deeplink)
      printf '%s\t%s\n' \
        src/lib/deeplink.ts '1s#"list_"#"l_"#' \
        src/lib/deeplink.ts '2s#"res_"#"r_"#' \
        src/lib/deeplink.ts '3s#"ed_"#"e_"#'
      ;;
    access)
      printf '%s\t%s\n' \
        src/lib/access.ts 's#include: \{ editors: true \}#include: {}#' \
        src/lib/access.ts 's#const isOwner = wishlist\.ownerId === user\.id#const isOwner = true#' \
        src/lib/access.ts 's#!isOwner [&][&] !isCoAuthor#!isOwner || !isCoAuthor#' \
        src/lib/access.ts 's#role: isOwner \? "owner" : "coAuthor"#role: isOwner ? "coAuthor" : "owner"#' \
        src/lib/access.ts 's#canEditGifts: true#canEditGifts: isOwner#'
      ;;
    dates)
      printf '%s\t%s\n' \
        src/lib/dates.ts 's#thisYear\.getTime\(\) >= today\.getTime\(\)#thisYear.getTime() > today.getTime()#' \
        src/lib/dates.ts 's#getUTCFullYear\(\) \+ 1#getUTCFullYear() + 0#' \
        src/lib/dates.ts 's#date\.getUTCDate\(\) !== day \|\| date\.getUTCMonth\(\) !== month - 1#false#' \
        src/lib/dates.ts 's#date\.getTime\(\) < todayUtc\(\)\.getTime\(\)#date.getTime() <= todayUtc().getTime()#' \
        src/lib/dates.ts 's#"післязавтра": 2#"післязавтра": 3#' \
        src/lib/dates.ts 's#normalized\.length < 4#normalized.length < 1#'
      ;;
    scrape-ipv4)
      printf '%s\t%s\n' \
        src/lib/scrape.ts 's#^    await assertPublicUrl\(current\);#    // mutated#' \
        src/lib/scrape.ts 's#a === 10 \|\| a === 127#a === 10#' \
        src/lib/scrape.ts 's#a >= 224#a >= 225#' \
        src/lib/scrape.ts 's#b >= 16 [&][&] b <= 31#b >= 16 \&\& b <= 32#' \
        src/lib/scrape.ts 's#redirect: "manual"#redirect: "follow"#' \
        src/lib/scrape.ts 's#MAX_REDIRECTS = 3#MAX_REDIRECTS = 100#' \
        src/lib/scrape.ts 's#\(b === 18 \|\| b === 19\)#(b === 18)#' \
        src/lib/scrape.ts 's#b >= 64 [&][&] b <= 127#b >= 64 \&\& b <= 126#'
      ;;
    ssrf)
      printf '%s\t%s\n' \
        src/lib/scrape.ts '@base' \
        src/lib/scrape.ts 's#if \(g\.slice\(0, 6\)\.every\(\(x\) => x === 0\)\) return true;#// mutated#' \
        src/lib/scrape.ts 's#g\[5\] === 0xffff\) \|\|#false) ||#' \
        src/lib/scrape.ts 's#g\[4\] === 0xffff [&][&] g\[5\] === 0#false#' \
        src/lib/scrape.ts 's#g\[0\] === 0x64 [&][&] g\[1\] === 0xff9b [&][&] g\.slice\(2, 6\)#false \&\& g.slice(2, 6)#' \
        src/lib/scrape.ts 's#if \(g\[0\] === 0x64 [&][&] g\[1\] === 0xff9b [&][&] g\[2\] === 1\) return true;#// mutated#' \
        src/lib/scrape.ts 's#if \(g\[0\] === 0x2002\)#if (false)#' \
        src/lib/scrape.ts 's#0xffc0#0xffff#' \
        src/lib/scrape.ts 's#0xfe00\) === 0xfc00#0xff00) === 0xfc00#' \
        src/lib/scrape.ts 's#g\[6\] >> 8, g\[6\] [&] 255, g\[7\] >> 8, g\[7\] [&] 255#g[7] >> 8, g[7] \& 255, g[6] >> 8, g[6] \& 255#'
      ;;
    *)
      echo "usage: $0 availability|deeplink|access|dates|scrape-ipv4|ssrf" >&2
      exit 2
      ;;
  esac
}

# Resolve the class BEFORE the loop: an error raised inside the process substitution that
# feeds it is swallowed, and an unknown class would print "0/0 killed" and succeed.
list="$(mutants "$class")" || exit $?
[ -n "$list" ] || { echo "no mutants for class '$class'" >&2; exit 1; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

killed=0
total=0
failed=0
while IFS=$'\t' read -r file expr; do
  total=$((total + 1))
  rm -rf "$work/tree"
  mkdir "$work/tree"
  # node_modules and generated/ are symlinked: copying them would dominate the run time.
  rsync -a --exclude node_modules --exclude generated --exclude .git --exclude coverage --exclude dist ./ "$work/tree/"
  ln -s "$PWD/node_modules" "$work/tree/node_modules"
  [ -d generated ] && ln -s "$PWD/generated" "$work/tree/generated"

  if [ "$expr" = "@base" ]; then
    git show "origin/main:$file" > "$work/mutant"
  else
    sed -E "$expr" "$work/tree/$file" > "$work/mutant"
  fi
  if cmp -s "$work/mutant" "$work/tree/$file"; then
    echo "NOT A MUTANT (expression changed nothing): $file  $expr" >&2
    failed=1
    continue
  fi
  cp "$work/mutant" "$work/tree/$file"

  if (cd "$work/tree" && env -u DATABASE_URL -u BOT_TOKEN npx vitest run --coverage.enabled=false >/dev/null 2>&1); then
    echo "SURVIVED: $file  $expr" >&2
    failed=1
  else
    killed=$((killed + 1))
    echo "killed:   $file  ${expr:0:70}"
  fi
done <<< "$list"

echo "$class: $killed/$total mutants killed"
exit "$failed"
