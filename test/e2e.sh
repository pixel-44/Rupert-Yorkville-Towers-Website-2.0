#!/usr/bin/env bash
# End-to-end pass over the real app: boots a server on a throwaway database,
# drives it with curl the way a browser would, and checks what comes back.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT=${TEST_PORT:-3111}
B=http://localhost:$PORT
S=$(mktemp -d)
DB=$(mktemp -d)

DATA_DIR="$DB" PORT="$PORT" node "$ROOT/server.js" > "$S/server.log" 2>&1 &
SERVER_PID=$!
cleanup() { kill "$SERVER_PID" 2>/dev/null || true; rm -rf "$S" "$DB"; }
trap cleanup EXIT

for _ in $(seq 1 40); do
  curl -sf "$B/healthz" > /dev/null && break
  sleep 0.25
done
curl -sf "$B/healthz" > /dev/null || { echo "server did not start"; cat "$S/server.log"; exit 1; }

A=$S/a.jar; C=$S/b.jar

fail() { echo "FAIL: $1"; exit 1; }
code() { curl -s -H "Referer: $B/" -o /dev/null -w '%{http_code}' "$@"; }

echo "== guest cannot post =="
[ "$(code -c $A "$B/posts/new")" = "302" ] || fail "guest new post not redirected"

echo "== signup A =="
curl -s -H "Referer: $B/" -c $A -b $A -o /dev/null -X POST "$B/signup" \
  -d "name=Ana Ruiz&email=ana@example.com&phone=(212) 555-0142&apartment=14C&password=hunter22&confirm=hunter22&bio=Have two cats&next=/board"
grep -q ryt_session $A || fail "no session cookie for A"

echo "== duplicate email rejected =="
[ "$(code -X POST "$B/signup" -d 'name=Other Person&email=ana@example.com&phone=2125550199&apartment=2A&password=hunter22&confirm=hunter22')" = "400" ] || fail "dup email allowed"

echo "== weak password rejected =="
[ "$(code -X POST "$B/signup" -d 'name=Weak Person&email=weak@example.com&phone=2125550188&apartment=3A&password=short&confirm=short')" = "400" ] || fail "weak password allowed"

echo "== signup B =="
curl -s -H "Referer: $B/" -c $C -b $C -o /dev/null -X POST "$B/signup" \
  -d "name=Ben Ito&email=ben@example.com&phone=917-555-0110&apartment=9B&password=hunter22&confirm=hunter22"
grep -q ryt_session $C || fail "no session cookie for B"

echo "== A posts a recurring job =="
LOC=$(curl -s -H "Referer: $B/" -b $A -o /dev/null -w '%{redirect_url}' -X POST "$B/posts" \
  -d "kind=need&category=Dog walking&title=Evening dog walk for a beagle&description=Twenty minute walk around the block each weekday evening, keys left with the doorman.&apartment=14C&price_min=20&price_max=30&price_unit=visit&schedule=recurring&recurrence=Weekdays around 6pm")
POST_ID=$(basename "$LOC")
[ -n "$POST_ID" ] || fail "post not created"
echo "   post id $POST_ID"

echo "== invalid post rejected =="
[ "$(code -b $A -X POST "$B/posts" -d 'kind=need&category=Dog walking&title=hi&description=short&apartment=&schedule=one_time')" = "400" ] || fail "invalid post accepted"
[ "$(code -b $A -X POST "$B/posts" -d 'kind=need&category=Cleaning&title=Deep clean 2 bed&description=Full clean of a two bedroom apartment, supplies provided.&apartment=14C&price_min=300&price_max=100&schedule=one_time')" = "400" ] || fail "inverted price range accepted"

echo "== post visible to guests, contact hidden =="
GUEST=$(curl -s -H "Referer: $B/" "$B/posts/$POST_ID")
echo "$GUEST" | grep -q "Evening dog walk" || fail "guest cannot see post"
echo "$GUEST" | grep -q "ana@example.com" && fail "guest can see private email"
echo "$GUEST" | grep -q "Create a resident account" || fail "guest not prompted to sign up"

echo "== guest cannot accept =="
[ "$(code -X POST "$B/posts/$POST_ID/accept")" = "302" ] || fail "guest accept not gated"
curl -s -H "Referer: $B/" "$B/posts/$POST_ID" | grep -q 'tag-status tag-open' || fail "guest accept changed status"

echo "== owner cannot accept own post =="
curl -s -H "Referer: $B/" -b $A -o /dev/null -X POST "$B/posts/$POST_ID/accept"
curl -s -H "Referer: $B/" "$B/posts/$POST_ID" | grep -q 'tag-status tag-open' || fail "owner accepted own post"

echo "== board filters =="
curl -s -H "Referer: $B/" "$B/board?category=Dog%20walking&schedule=recurring" | grep -q "Evening dog walk" || fail "filter missed post"
curl -s -H "Referer: $B/" "$B/board?category=Cleaning" | grep -q "Evening dog walk" && fail "filter leaked post"
curl -s -H "Referer: $B/" "$B/board?q=beagle" | grep -q "Evening dog walk" || fail "search missed post"

echo "== B accepts =="
CONVO_URL=$(curl -s -H "Referer: $B/" -b $C -o /dev/null -w '%{redirect_url}' -X POST "$B/posts/$POST_ID/accept")
CONVO=$(basename "$CONVO_URL")
[ -n "$CONVO" ] || fail "accept did not open a thread"
echo "   conversation $CONVO"
curl -s -H "Referer: $B/" "$B/posts/$POST_ID" | grep -q 'tag-status tag-matched' || fail "post not matched"

echo "== second acceptor blocked =="
rm -f $S/c.jar
curl -s -H "Referer: $B/" -c $S/c.jar -b $S/c.jar -o /dev/null -X POST "$B/signup" \
  -d "name=Cara Lin&email=cara@example.com&phone=6465550133&apartment=7D&password=hunter22&confirm=hunter22"
R=$(curl -s -H "Referer: $B/" -b $S/c.jar -o /dev/null -w '%{redirect_url}' -X POST "$B/posts/$POST_ID/accept")
[[ "$R" == *"taken=1"* ]] || fail "race on accept not guarded (got $R)"

echo "== contact unlocked for the matched pair only =="
curl -s -H "Referer: $B/" -b $A "$B/posts/$POST_ID" | grep -q "ana@example.com" || fail "owner cannot see contact box"
curl -s -H "Referer: $B/" -b $S/c.jar "$B/posts/$POST_ID" | grep -q "ana@example.com" && fail "third party sees contact"

echo "== messaging =="
curl -s -H "Referer: $B/" -b $A -o /dev/null -X POST "$B/messages/$CONVO" -d "body=Great, keys are with the doorman."
curl -s -H "Referer: $B/" -b $C "$B/messages/$CONVO" | grep -q "keys are with the doorman" || fail "message not delivered"
curl -s -H "Referer: $B/" -b $C "$B/api/messages/$CONVO?after=0" | grep -q "doorman" || fail "poll API broken"
[ "$(code -b $S/c.jar "$B/messages/$CONVO")" = "404" ] || fail "outsider can read thread"
[ "$(code -b $S/c.jar "$B/api/messages/$CONVO")" = "404" ] || fail "outsider can poll thread"

echo "== unread badge =="
curl -s -H "Referer: $B/" -b $C -o /dev/null -X POST "$B/messages/$CONVO" -d "body=Perfect, starting Monday."
curl -s -H "Referer: $B/" -b $A "$B/board" | grep -q 'class="badge"' || fail "unread badge missing"
curl -s -H "Referer: $B/" -b $A -o /dev/null "$B/messages/$CONVO"
curl -s -H "Referer: $B/" -b $A "$B/board" | grep -q 'class="badge"' && fail "badge persisted after read"

echo "== XSS is escaped =="
LOC2=$(curl -s -H "Referer: $B/" -b $C -o /dev/null -w '%{redirect_url}' -X POST "$B/posts" \
  -d 'kind=offer&category=Cleaning&title=<script>alert(1)</script>&description=Deep cleaning available on weekends, I bring my own supplies.&apartment=9B&price_min=90&price_unit=total&schedule=one_time')
curl -s -H "Referer: $B/" "$(basename $LOC2 | xargs -I{} echo $B/posts/{})" | grep -q "<script>alert(1)</script>" && fail "unescaped HTML rendered"

echo "== completion + reopen =="
curl -s -H "Referer: $B/" -b $A -o /dev/null -X POST "$B/posts/$POST_ID/status" -d "action=complete"
curl -s -H "Referer: $B/" "$B/posts/$POST_ID" | grep -q 'tag-status tag-completed' || fail "not completed"
curl -s -H "Referer: $B/" -b $S/c.jar -o /dev/null -X POST "$B/posts/$POST_ID/status" -d "action=reopen"
curl -s -H "Referer: $B/" "$B/posts/$POST_ID" | grep -q 'tag-status tag-completed' || fail "outsider reopened post"
curl -s -H "Referer: $B/" -b $A -o /dev/null -X POST "$B/posts/$POST_ID/status" -d "action=reopen"
curl -s -H "Referer: $B/" "$B/posts/$POST_ID" | grep -q 'tag-status tag-open' || fail "owner reopen failed"

echo "== edit gating =="
[ "$(code -b $C "$B/posts/$POST_ID/edit")" = "404" ] || fail "non-owner can edit"
curl -s -H "Referer: $B/" -b $A -o /dev/null -X POST "$B/posts/$POST_ID/edit" \
  -d "kind=need&category=Dog walking&title=Evening dog walk (updated)&description=Twenty minute walk around the block each weekday evening.&apartment=14C&price_min=25&price_max=35&price_unit=visit&schedule=recurring&recurrence=Weekdays at 6pm"
curl -s -H "Referer: $B/" "$B/posts/$POST_ID" | grep -q "updated" || fail "edit not saved"

echo "== login/logout =="
rm -f $S/d.jar
curl -s -H "Referer: $B/" -c $S/d.jar -b $S/d.jar -o /dev/null -X POST "$B/login" -d "email=ana@example.com&password=hunter22"
curl -s -H "Referer: $B/" -b $S/d.jar "$B/my-posts" | grep -q "Evening dog walk" || fail "login failed"
[ "$(code -X POST "$B/login" -d 'email=ana@example.com&password=wrongpass')" = "401" ] || fail "bad password accepted"
curl -s -H "Referer: $B/" -b $S/d.jar -c $S/d.jar -o /dev/null -X POST "$B/logout"
[ "$(code -b $S/d.jar "$B/my-posts")" = "302" ] || fail "logout did not end session"

echo "== password change invalidates old sessions =="
curl -s -H "Referer: $B/" -b $A -o /dev/null -X POST "$B/account/password" -d "current_password=hunter22&new_password=hunter333&confirm_password=hunter333"
[ "$(code -b $S/d.jar "$B/account")" = "302" ] || fail "old session still valid"

echo "== cross-site POST blocked =="
[ "$(curl -s -H "Origin: http://evil.example" -b $A -o /dev/null -w '%{http_code}' -X POST "$B/posts/$POST_ID/status" -d 'action=cancel')" = "403" ] || fail "cross-origin POST allowed"
curl -s -H "Referer: $B/" "$B/posts/$POST_ID" | grep -q 'tag-status tag-open' || fail "cross-origin POST changed data"

echo "== help panel + 404 =="
curl -s -H "Referer: $B/" "$B/" | grep -q "646-617-0040" || fail "help phone missing"
curl -s -H "Referer: $B/" "$B/" | grep -q "kieran4v@gmail.com" || fail "help email missing"
curl -s -H "Referer: $B/" "$B/board" | grep -q "Call anytime for questions, improvements, or complaints." || fail "help text missing"
[ "$(code "$B/nope")" = "404" ] || fail "404 handler broken"
[ "$(code "$B/posts/99999")" = "404" ] || fail "missing post not 404"

echo
echo "ALL CHECKS PASSED"
