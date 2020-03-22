# Brute Force Iteration
Sometimes, you don't have very much information to go off when trying to crack some crypto. Maybe you know the length of a given secret, like session cookie of determinate length, and/or maybe you've got some idea of the character set, like knowing a PIN consists only of numeric characters. Maybe you don't even have that much information to begin with. There may be times when you have no better option than to just try _every, single_ option, _one at a time_ until you eventually come across the right answer.  

There exists an entire field of mathematics devoted to selecting particular elements from a set, [Combinatorics](https://en.wikipedia.org/wiki/Combinatorics). Within, we can learn about combinations: where a unique combination is based entirely on the selection of elements, and permutations: where both the selection and their order constitutes a unique permutation. When it comes to brute forcing though, we're actually after *permutations with repeats*. Think of a cryptographic key, which will almost certainly contain the same byte multiple times, or a weak password derived entirely from a single, repeated character.

Unfortunately, including repeats massively increases our search space...

```
// the number of permutations without repeats is the factoral of the number of elements in the set
set := []byte("abcd")
numPermsInSet := 4 * 3 * 2 * 1 // 24

// the number of permutations with repeats is n^r
// n = is the number of elements in the set
// r = the quantity of elements we pick
picks := 4
numPermsWithRepeatsInSet := len(set) ^ picks // 256
```

Of course, since we're usually dealing with much larger sets (typically alphabets), and larger sample sizes, we will regularly want to find something in a ginormous space. Consider an 8 digit, base64 character password: `64^8 = 281,474,976,710,656`. If we _were_ to embark on such a costly search (often made significantly more costs if we're needing to hash or encrypt every iteration), we'd want some code that was reasonably performant!

## Writing a Brute Force Iteration Algorithm
Before we begin, let's visualise our desired output:
```
alphabet = [a,b,c]
l := 3

// start
[a,a,a]
[a,a,b]
[a,a,c]
[a,b,a]
[a,b,b]
[a,b,c]
...
[c,b,c]
[c,c,a]
[c,c,b]
[c,c,c]
// done!
```

So on the surface this is looking a lot like an exercise in counting! There are a few more factors we definitely want to consider though:

- We want to be able to define our alphabet (picking a charset based on password rules or digits for PINs/PANs)
- We want to be able to iterate through a massive search space without running OOM or blowing our stack (so recursion is a non-starter)
- Our alphabet should be able contain more elements than our target length (and vice versa)
- We want this to be parallelisable, including across machines/processes
- Repeated characters are a must ([a,a,a], [a,a,b] and [a,b,a] etc)
- We will want to be able to pass in some predicate to check each iteration
- Sometimes we'll want to find only a single match, but other times we'd like our predicate to match multiple times or to exhaust our entire search space.

Let's envision a possible API then, that satisfies the configuration requirements we have, and allows for parellelised execution under the hood:

`func BruteForce(alphabet []byte, l int, pred func([]byte) bool, matches int) chan []byte`

This allows us to listen on a channel for any hits (without knowing how many we might find, or knowing we've set our matches value if we're looking for a specific number or only the first hit). Specifying -1 matches should allow us to search the entire space. This API doesn't directly allow us to fine-tune parrelisation (like by providing a workers variable we can set), because that approach does not help to parellelise across machines/processes (because if we start 2 jobs both with 8 workers for example, they would just be doing the same work as eachother). Instead, we can provide a separate API for iterating from a given prefix, where co-ordination across workers is left to the caller, but the caller can be confident by providing each worker with a unique prefix to scan, no workers will overlap in their search space.

`func BruteForceLoopWithPrefix(alphabet []byte, prefix []byte, l int, pred func([]byte) bool, matches int) chan []byte`

## Now we have some vague direction, let's begin!

Naturally, I started out with an exhaustive Google search to try and find some literature on algorithms that solve this problem, but was unable to find anything. Most the results I came across didn't consider repeats (like [Heap's Algorithm](https://en.wikipedia.org/wiki/Heap%27s_algorithm) and the [Steinhaus–Johnson–Trotter algorithm](https://en.wikipedia.org/wiki/Steinhaus%E2%80%93Johnson%E2%80%93Trotter_algorithm)). Looks like I need to build something myself huh? My gut tells me we could just write a couple of for loops to get the job done. Shouldn't be too hard ?...

## Baby Steps: A Few Good Old-Fashioned for Loops
Yeah, I did underestimate how annoying this thing would be to write, lots of state to manage and the constant temptation towards optimisation that lead me down some dead-ends. I kept it simple to start with; no predicate, no parrelelisation, just some code to generate strings of a given length from a given alphabet.Here's what I came up with: (I can't help but feel there are more optimisations to be made here!)

```
func BruteForceWIP(alphabet []byte, l int) {
	alphabetLen := len(alphabet)
	b := bytes.Repeat(alphabet[:1], l)
	prog := make([]int, l) // prog tracks the _numeric_ progress e.g [0,0,0], [0,0,1] ... [0,1,0], [0,1,1]

	for pos := l - 1; pos > 0; pos-- {
		for charInc := 0; charInc <= alphabetLen-1; charInc++ {
			if pos != l-1 {
				pos++ // not currently operating on the least significant digit, shift right towards LSD
				charInc--
				continue
			}

			b[pos] = alphabet[charInc]
			prog[pos]++
		}

		// Consult our progress array to determine our next MSD to inc and which lower digits to reset
	stateUpdate:
		for iii := l - 1; iii >= 0; iii-- {
			switch {
			case prog[iii] >= alphabetLen-1: // This digit is done, reset this digit...
				if iii == 0 {
					return
				}
				prog[iii] = 0
				b[iii] = alphabet[0]
			default: // We've reset all lower digits that we've scanned through, now we can increment
				prog[iii]++
				b[iii] = alphabet[prog[iii]]
				break stateUpdate
			}
		}
	}
}
```

Sure enough, this iterates through all of our permutations _with repeats_ to produce everything, for an example where our alphabet is [a,b,c] and our target length is 3, from [a,a,a] to [c,c,c]. Nice!

Without a predicate though, we're not actually doing anything but burning cycles. We want to check each iteration of our byte slice to see if it satisfies our search criteria. One of the reasons I didn't want to get too obsessive about optimising the above code is because this predicate is almost certainly going to be the most costly part of this process. It may be hashing the input, or trying it out as a possible symmetric key via some decrypt operation, or even a combination of expensive operations (like compressing then encrypting as we might do if we were playing with some compression oracle). This is easy to tack on.

```
func BruteForce(alphabet []byte, l int, pred func([]byte) bool) []byte {
	alphabetLen := len(alphabet)
	b := bytes.Repeat(alphabet[:1], l)
	prog := make([]int, l)

	for pos := l - 1; pos > 0; pos-- {
		for charInc := 0; charInc <= alphabetLen-1; charInc++ {
			if pos != l-1 {
				pos++
				charInc--
				continue
			}

			b[pos] = alphabet[charInc]
			if pred(b) {
				return b // we got a match!
			}
			prog[pos]++
		}

	stateUpdate:
		for iii := l - 1; iii >= 0; iii-- {
			switch {
			case prog[iii] >= alphabetLen-1:
				if iii == 0 {
					return
				}
				prog[iii] = 0
				b[iii] = alphabet[0]
			default:
				prog[iii]++
				b[iii] = alphabet[prog[iii]]
				break stateUpdate
			}
		}
	}
}
```

Now we're doing something potentially costly inside our predicate, the argument for parrelisation becomes much stronger. Not just local (on our machine) parrelisation, but it would also be nice to be able to spread this expensive search across multiple machines or processess, without needing to co-ordinate which worker has already checked which values. Instead, it would be nice to specify a sub-range we'd like to scan, knowing another worker can start from the end of our range. Rather than specify this numerically, by providing an integer value for the number of values we'd like to check, and another value for the number we'd like to start from, it will be simpler to instead split our search using a 'prefix' we'd start from, and then stopping once we've exhausted the space of values that also have that prefix. This will also make the task of doing 'masked searches' much simpler, but we'll get to that later! 

For an example of scanning based off a prefix, imagine we are searching for a 10 character password from the alphabet `a..j`, we could specify a through to j as the prefixes, with one worker searching from `aaaaaaaaaa => ajjjjjjjjj` and another searching `baaaaaaaaa => bjjjjjjjjj` etc.

```
func BruteForceLoopWithPrefix(alphabet []byte, prefix []byte, l int, pred func([]byte) bool) []byte {
	alphabetLen := len(alphabet)

	// Set up our starting point to include the prefix...
	b := bytes.Repeat(alphabet[:1], l-len(prefix))
	b = append(prefix, b...)

	prog := make([]int, l)

	// ... and update our for loop to abort when we reach our prefix characters (i.e pos > len(prefix))
	for pos := l - 1; pos > len(prefix); pos-- {
		for charInc := 0; charInc <= alphabetLen-1; charInc++ {
			if pos != l-1 {
				pos++
				charInc--
				continue
			}

			b[pos] = alphabet[charInc]
			if pred(b) {
				return b
			}
			prog[pos]++
		}

	stateUpdate:
		for iii := l - 1; iii >= 0; iii-- {
			switch {
			case prog[iii] >= alphabetLen-1:
				if iii == len(prefix) {
					return nil
				}
				prog[iii] = 0
				b[iii] = alphabet[0]
			default:
				prog[iii]++
				b[iii] = alphabet[prog[iii]]
				break stateUpdate
			}
		}
	}
}
```

Now we can split our search space down into smaller chunks, we can spin off workers in their own goroutine and use a channel to phone home if they get a match! Though, we might not just want to find a single match, maybe we want our workers to continue even beyond their first hit; maybe we want to find X number of hits, or maybe we'd just like to exhaust the entire space. That isn't really a concern for the workers themselves, we can just pass them a channel that they can send a nil slice to when they reach the end of their space, and we can return another channel to our caller that we push hit to, which we will close when the caller is happy they have enough hits/all workers are finished. This is pretty much a finished implementation!

```
func BruteForce(alphabet []byte, l int, pred func([]byte) bool, matches int) chan []byte {
	c := make(chan []byte)

	for _, char := range alphabet {
		go BruteForceLoopWithPrefix(c, alphabet, []byte{char}, l, pred)
	}

	out := make(chan []byte)
	go func() {
		found := 0
		finished := 0

		for result := range c {
			if result == nil {
				finished++
			} else {
				out <- result
				found++
			}

			if finished == len(alphabet) || found == matches {
				close(out)
				return
			}
		}
	}()

	return out
}

func BruteForceLoopWithPrefix(c chan []byte, alphabet []byte, prefix []byte, l int, pred func([]byte) bool) {
	alphabetLen := len(alphabet)
	b := bytes.Repeat(alphabet[:1], l-len(prefix))
	b = append(prefix, b...)
	hit := make([]byte, l)

	prog := make([]int, l)

	for pos := l - 1; pos > len(prefix); pos-- {
		for charInc := 0; charInc <= alphabetLen-1; charInc++ {
			if pos != l-1 {
				pos++
				charInc--
				continue
			}

			b[pos] = alphabet[charInc]
			if pred(b) {
				copy(hit, b)
				c <- hit
			}
			prog[pos]++
		}

	stateUpdate:
		for iii := l - 1; iii >= 0; iii-- {
			switch {
			case prog[iii] >= alphabetLen-1:
				if iii == len(prefix) {
					c <- nil
					return
				}
				prog[iii] = 0
				b[iii] = alphabet[0]
			default:
				prog[iii]++
				b[iii] = alphabet[prog[iii]]
				break stateUpdate
			}
		}
	}
}
```

We should really test code this complex; the cost of a bug here could be hours of wasted time! We can refer back to our original equation of `n^r` to determine if we've successfully exhausted our search space.

```
func TestBruteForce(t *testing.T) {
	charset := []byte("abcd")
	l := 10

	var mut sync.Mutex
	i := float64(0)
	matchFn := func(b []byte) bool {
		if b != nil {
			mut.Lock()
			i++
			mut.Unlock()
		}
		return false
	}

	for range BruteForce(charset, l, matchFn, -1) {
	}

	n := float64(len(charset))
	r := float64(l)

	exp := math.Pow(n, r) // n^r

	if i != exp {
		t.Fatalf("wrong. exp %f, got %f", exp, float64(i))
	}
}
```

What about those 'masked searches' that I mentioned earlier? Well, that would be better off as a separate post, because there is lots more to talk about there. For now, we've got a usable brute force iterator that will certainly prove useful to me, and I hope you can make some use of it as well!