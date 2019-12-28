# Cryptopals Sets 5-6: Retrospective

Continuing on with the [Cryptopal challenges](https://cryptopals.com), the 5th and 6th sets focused primarily on Diffie-Hellman, RSA and DSA, which means more maths, and for me, that means plenty more confusion. Yet, these are widely used primitives, and primitives that can be insecurely implemented (particularly RSA with it's plethora of [widely known pitfalls](https://blog.trailofbits.com/2019/07/08/fuck-rsa/)), so it's worth knowing what mistakes a 'bad' implementation might include.

## Cheat-sheet Cryptography
The math behind these 3 primitives can be concisely expressed, even though secure implementations must account for a multitude more factors (defensive negotiations, padding, nonce-reuse etc).

### Diffie-Hellman:
```
p = nistP // can use NIST recommended P or generate one for group
g = 2 // again, can use NIST or generate one

alicePriv = rand(p) // must be less than P
bobPriv   = rand(p) // must be less than P

alicePub = (g^^alicePriv) % p
bobPub   =  (g^^bobPriv) % p

sharedSecret = (alicePub^^bobPriv) % p == (bobPub^^alicePriv) % p
```

### Textbook RSA:
```
p = randPrime(keyLen) // a random prime of key len bits
q = randPrime(keyLen)

n = p * q
totient = p-1 * p-1

e = 65537 // chosen because it is a Fermat prime

privKey = modinv(e, totient)
pubKey  = {modulus: n, exponent: e}

ciphertext = (plaintext^^pubKey.e) % pubKey.n
plaintext  = (ciphertext^^privKey) % pubKey.n
```

### DSA:
```
p,g,q = dsaParamGen() // or could be preselected

priv = rand(q) // must be less than q
pub  = (g ^^ priv) % p

nonce = rand(q)

// Sign to produce r and s
r = (g^^nonce) % p) % q
s = ((k^^-1) * (H(m)+(priv*r))) % q

// Verify
w = modinv(s,q)
u1 = ((H(m) * w) % q)
u2 = (r * w) % q
v = (((g^^u1) * (g^^u2)) % p ) % q // valid if v == r 
```

## Negotiations are about much more that just interoperability...
Generally, when thinking about interoperability between systems, it can be easy to default to thinking about specifications and protocols; on just getting clients and servers to play nicely. In reality though, negotiations are one of the most obvious attack vectors for an adversary, and time and time again (POODLE, BEAST, and here in challenges like [35](https://cryptopals.com/sets/5/challenges/35) and [37](https://cryptopals.com/sets/5/challenges/37)), they can exploit implementations that don't defend against malicious intent. Reused or specially crafted parameters, such as providing a zeroed key, can force all operations to become predictable or weaken the outputs of the operation. Any scenario in which a client can suggest parameters is one you should look to harden.

## ... but without frequent negotiations/handshakes, you're vulnerable to offline dictionary attacks.
If you submit parameters that don't include some element of 'uniqueness' per operation (such as a unique salt per operation, or other random element that changes each time like generating unique keys per operation in Ephemeral DH), you're potentially allowing an adversary to crack or brute-force any secrets you've exchanged. Exchanging such secrets with a malicious server or evesdropper just once could jeopardise the security of all future communications.

## Textbook RSA is as trivial to implement as the level of security it provides
Challenge 39 is about as easy a Cryptopal challenge can be (particularly in Go where the invmod operation is built into the stdlib). Of course, it provides virtually no real security, due to the huge range of known vulnerabilities. [This](https://crypto.stanford.edu/~dabo/papers/RSA-survey.pdf) paper is fairly exhaustive on the matter and some of the attacks are included in these cryptopals sets. Some attacks involve fairly esoteric math (like Bleichenbacher's PKCS 1.5 Padding Oracle, eurgh), while others just exploit obvious omissions from the system (such as padding, and safeguards against weak keys/low exponents). RSA is possibly the primitive that you should spend the most time vetting when choosing a library, or better yet, if you can avoid it altogether, avoid it entirely and look into something like (x25519)[https://godoc.org/golang.org/x/crypto/curve25519].


### Useful Resources!
[Diffie-Hellman RFC](https://tools.ietf.org/html/rfc2631)     
[Bleichenbacher's PKCS 1.5 Padding Oracle Attack](http://archiv.infsec.ethz.ch/education/fs08/secsem/bleichenbacher98.pdf)     
[Notes on e=3 signature forgery](https://mailarchive.ietf.org/arch/msg/openpgp/5rnE9ZRN1AokBVj3VqblGlP63QE)


## Set 7 next...