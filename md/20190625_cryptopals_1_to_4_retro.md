# Cryptopals Sets 1-4: Retrospective

I’ve been having a lot of fun, and learning a great deal, working through the [cryptopal challenges](https://cryptopals.com/); implementing, then breaking, crypto primitives/protocols. The first 4 sets are fairly straight forward, but there are still a lot of key concepts and take-aways, and spending the time to actually work through them all has been great for committing these concepts to memory.

Like all crypto code, it pays to thoroughly document the reasoning behind the code, so I figured it might also be worthwhile to jot down some key takeaways from the first half of the challenges.

# Comments are King
Some of these attacks require very precise implementations (like the padding oracle attack, challenge 17), and sometimes I ended up tripping up over the minor details (like including the key length when calculate the hash state for a key extension attacks in challenges 29 and 30). In a few months time, there is no way I’d remember all these minor details from all of these challenges, which is an automatic tell I need to be fastidiously commenting. Looking back through my solutions now, I can quickly remember the theory behind the challenges, and future me is very grateful for that.

I wish more cryptographers commented their code more, learning security in 2019 should be as inclusive as possible, and comments are one way to help lower the barrier of entry for newcomers.

# Blocks are susceptible to being ‘poisoned’...
These challenges were the first time I ever actually set about poisoning a block inside a block cipher, and while the code is a little bit fiddly to get right, the effects are catastrophic. There is a reason everyone has moved onto stream ciphers.

# ...and keystreams are easy to reuse
Be it IV-as-key (challenge 27), or nonce reuse (challenges 19 and 20), or a keystream generated predictably (challenge 24), examples of keystream reuse often cause catastrophic failures (as seen in AES w/CTR or the Mersenne Twister cipher). Always something to be mindful of, or to test your implementations against.

# Key-Prefix Hashing is broken
Modern hashing and HMAC implementations have built in protections against length extension attacks (challenges 29 and 30). Many hashing algorithms are stateful, so it is important to understand how you arrived at your current state, and what an attacker could do if they knew this state. Oh, and of course, that digests reveal the majority of the state!

# Most importantly, implementing crypto primitives isn’t so scary!
‘Don’t roll you’re own crypto’ is thrown around so often and so vehemently, and secure implementations have been written in all major languages, so in the past I’ve felt no need to implement any primitives myself. These challenges have shown me the educational advantages of doing so; how important familiarising yourself with the internals of a primitive can be to helping you understand their weaknesses.

Equally importantly though, they’ve helped me see that even a mere mortal such as myself can understand, and write, cryptographic code. The resources are out there, and the RFCs/white-papers behind these things are decipherable with a bit of effort and determination. 

In the future, I think the first thing I’ll look to do when meeting a new primitive will be just to re-implement it myself, working from an RFC or some pseudo-code or even just refactoring a proven implementation in my language. 

[My solutions are available here, I hope they prove insightful to someone](https://github.com/sHesl/cryptopals)    

### Useful resources!
[Filippo Valsorda's solutions](https://github.com/FiloSottile/mostly-harmless/tree/master/cryptopals)    
[Filippo also live streamed his sessions, what a legend!](https://www.youtube.com/watch?v=eE_Tz6udUQU&t=16s)    
[Super useful post on Padding oracle attacks from Robert Heaton](https://robertheaton.com/2013/07/29/padding-oracle-attack/)    


## On to set 5!