# Understanding Nonce Reuse Plaintext Recovery

I recently came across the [miscreant](https://github.com/miscreant/miscreant) library, and read through its enlightening (and slightly terrifying) explanation of the dangers of nonce reuse in vulnerable symmetrical encryption algorithms. My wider reading on the subject helped build up my understanding, but I still wanted to see a concrete example of how an attack actually works.

To express this, I think it would be best to work through backwards, first showing a code example of how such a plaintext recovery would work, and then look into the specifics of what allows this recovery to take place.

## An Example: Plaintext Recovery by Exploiting Nonce Reuse
```
key, nonce := make([]byte, 32), make([]byte, 32)
rand.Read(key)
rand.Read(nonce)

c, _ := aes.NewCipher(key)
block, _ := cipher.NewGCMWithNonceSize(c, len(nonce))

plaintext := []byte("this is our secret message")
ciphertext := block.Seal(nil, nonce, plaintext, nil)

zerosPlaintext := []byte("00000000000000000000000000")
zerosPayloadCiphertext := block.Seal(nil, nonce, zerosPlaintext, nil) // Nonce is reused here!

output := xor(ciphertext, zerosPayloadCiphertext) 

recoveredPlaintext := xor(output, zerosPlaintext) // "this is our secret message"
```

At first glance, we can see a curious looking plaintext (a string consisting entirely of zeros), as well as two XOR operations, using both ciphertext material and plaintext material to recover the plaintext. The secret to understanding this all lies within the nonce. 

## Nonce aka ‘IV’ aka ‘initialisation vector’ aka ‘number used only once’

Nonces are the vital element that ensures a single plaintext, encrypted twice with the same key, does not produce the same output. The term nonce more generally refers to a ‘number used only once’, meaning that a second encryption operation should use a different nonce, which, in some way, manipulates the encryption operation and therefore produce a different ciphertext. Often, they are constructed via PRNG, using the same method that is used for the encryption key, but there are also implementations that use incrementing integer or sequence counters as nonces; incrementing values reduces the chance of a duplicate nonce being generated via PRNG.

There is some flexibility around the terms nonce and initialisation vector/IV. Most people tend to use only one or the other, but often their definition is interchangeable (IV tends to be used more when talking specifically about block ciphers). The term can be applied more broadly to equate to session keys, salts, uuids etc as well, but here I’m speaking specifically in the context of symmetric encryption algorithms.

A primary differentiator between a nonce and a key is that a nonce does not necessarily need to be considered secret; exposing the value of the nonce should not reduce the overall security of the protocol. Both parties need the value to encrypt/decrypt a message, but access to only the nonce or nonce+ciphertext/plaintext should not expose any information about the key.

## But what does a nonce actually *do*?

The implementation details of the nonce is slightly different between block and stream ciphers (and even between different algorithms). For stream ciphers, the key and the nonce are concatenated, or perhaps hashed, to produce a keystream. Block ciphers however, are a bit more interesting when considering the role of the nonce. 

Let’s think back to a fundamental detail of block ciphers; that the output of the previous block is used as the input to the subsequent block. That leaves us with a problem, how do we seed our initial block? If we don’t seed our initial block with some unique or random information, and simply begin by computing our first block against only our key, any messages that begin in an predictable manner (such as communication protocols that use headers or file types with predictable metadata headers), will encrypt in the same manner. If this predictable segment equals or extends the length of the first block, that information will be visible in the resulting ciphertext.

We can see this by sharing a key and nonce between two almost identical blocks of plaintext.
```
a := []byte(`abcdefghijklmnopqrstuvwxyz123456`)
b := []byte(`abcdefghijklmnopqrstuvwxyz123457`)

key := make([]byte, 32)
nonce := make([]byte, 32)
rand.Read(key)
rand.Read(nonce)

c, _ := aes.NewCipher(key)
gcm, _ := cipher.NewGCMWithNonceSize(c, 32)

// Same nonce, same key and plaintext of block length with only 1 differing value = very similar ciphertexts
aOut := gcm.Seal(nil, nonce, a, nil) // A21E6938587978975B70D4CD2E9775E95EED47F8EB831C2145A37B74049A6FAFE6F0146CDF981691671AE1E4CB993C43
bOut := gcm.Seal(nil, nonce, b, nil) // A21E6938587978975B70D4CD2E9775E95EED47F8EB831C2145A37B74049A6FAE00B0E8EA155449DE2438A06075CD3CC2

bNonce := make([]byte, 32)
rand.Read(bNonce)

bWithNewNonce := gcm.Seal(nil, bNonce, b, nil) // F85737382B2D0DF1B59198F06F26D63D521EDD3D65552E6573AAE50585064F7FE9634B23848DC1EB98E6F86E72C3B1AE
```

This helps illustrates just how much influence the nonce has over the first block of our block cipher. Furthermore, since subsequent blocks are seeding with the result of the previous block, this influence extends to all blocks throughout the cipher, propagating massive changes through to the resulting ciphertext; constituting the [diffusion](https://en.wikipedia.org/wiki/Confusion_and_diffusion#Definition) component of a secure block cipher.

Randomly generated nonces, of equal length to the block length, are used to seed this initial block, which is why they are more often referred to as ‘initialisation vectors’ in the context of block ciphers. Using a different nonce/initialisation vector for each operations means the encryption of the first block begins from a different point, so all subsequent substitutions/permutations/transpositions etc produce different results.

The stream cipher scenario is more straight forward, but it identifies that is not just nonce reuse that can cause catastrophic failures, but all forms of keystream reuse. Imagine for example, that you felt compelled to implement a stream cipher generated from a stream of entropy that you were _absolutely certain_ was not being cloned by an adversary. If that base assumption does not hold, the adversary can perform this exact same attack (encrypting zeros and XOR'ing the ciphertexts) to recover your original message. This is one reason why something like a Mersenne Twister cipher is not recommended for production.
  
## A Scenario to Exploit

So what does a real world exploitation of this look like? First, we will need an encryption implementation that uses a vulnerable cipher; AES-GCM, AES-CTR and ChaCha20Poly1305 are some widely used examples. Of course, it will also need to be incorrectly implemented, reusing nonces between operations; **there are no secure or valid reasonings for reusing a nonce, we can only assume it is an implementation flaw!** Perhaps, messages between parties are ordered, indicating an associated counter value for a CTR cipher to use as a nonce, potentially allowing an attacker to lie about their message order, tricking a server into reusing a previously used nonce multiple times.

In addition, our adversary will need access to two more things: 
- access to the ciphertext material for which they want to decrypt
- the ability to encrypt an arbitrary plaintext with the same key that was used to encrypt above ciphertext material

These requirements suggest the attacker needs to be able to eavesdrop on the conversation in real-time (to acquire the ciphertext material), and be able to trick an actor into encrypting an arbitrary plaintext during this same session (else the key may rotate). Any implementation that exposes these two weaknesses may be vulnerable to known-plaintext and chosen-plaintext attacks. However, typically both KPA and CPA attacks involve the attacker having access to encrypt huge quantities of plaintext, but nonce reuse attacks can be achieved after encrypting only a single, specifically constructed plaintext. So what is this specific plaintext material the attacker will look to encrypt? 

## The Arbitrary Plaintext
We know that XORing a value with zeros will simply return the non-zero value:
```
xor("abc", "000") // "abc"
```

We also know that XORing two identical values cancels the two values out entirely, returning only zeros:
```
xor("abc", "abc") // "000"
```

If we combine these two bits of knowledge, we can reason that:
- XORing two ciphertext encrypted with the same key/nonce combo will ‘cancel’ the keystream out, returning only the XOR of our two plaintexts. `a b c XOR a b d == c XOR d`
- If one of our plaintexts was constructed entirely from zeros, when it was XOR’d against the unknown plaintext in the step above, it retained the structure of that original plaintext, having no influence on the output

**The outcome is that our XOR’d plaintexts can be XOR’d once more, against zeros, to reveal the value of the original plaintext!**

Let’s revisit our initial example, and throw in a few additional comments:
```
key, nonce := make([]byte, 32), make([]byte, 32)
rand.Read(key)
rand.Read(nonce)

c, _ := aes.NewCipher(key)
block, _ := cipher.NewGCMWithNonceSize(c, len(nonce))

plaintext := []byte("this is our secret message")
ciphertext := block.Seal(nil, nonce, plaintext, nil)

zerosPlaintext := []byte("00000000000000000000000000") // Our specifically constructed plaintext to encrypt
zerosPayloadCiphertext := block.Seal(nil, nonce, zerosPlaintext, nil)

// Cancel out the key and nonce by XORing ciphertexts together
output := xor(ciphertext, zerosPayloadCiphertext) 

// Since we have canceled the key and nonce out, output is simply the XOR of plaintext and zerosPlaintext.
// We know the value of zerosPlaintext, and we know that XORing zero values returns the non-zeros input
// aka the original plaintext we are trying to crack!
revealedSecret := xor(output, zerosPlaintext) // "this is our secret message"
```

Perhaps the communication protocol uses known (and validated) payload structures, so the attacker can’t just
submit a string of zeros for encryption. No problem, they can attempt to mirror the expected structure, replacing as much of the content as possible with zeros. 

Say the encrypted payload needed to be of a format like:
```
type payload struct {
	A            int       `json:"a"`
	B            bool      `json:"b"`
	InnerPayload innerPayload `json:"innerPayload"`
}

type innerPayload struct {
	Secret string `json:"secret"`
}
```

The attacker would look to encrypt the following payload:
```
{"a": 0, "b": true, "innerPayload": {"secret": "0000000000000000000000000000000000" }}
```


Shown as a full sample:
```
key, nonce := make([]byte, 32), make([]byte, 32)
rand.Read(key)
rand.Read(nonce)

c, _ := aes.NewCipher(key)
block, _ := cipher.NewGCMWithNonceSize(c, len(nonce))

secretPayload := payload{
  A:            0,
  B:            true,
  InnerPayload: innerPayload{Secret: "top secret stuff"},
}

plaintext, _ := json.Marshal(secretPayload)
ciphertext := block.Seal(nil, nonce, plaintext, nil)

zerosPayload := payload{
  A:            "000",
  B:            "000",
  InnerPayload: innerPayload{Secret: "00000000000000000000000000000000000000"},
}

zerosPlaintext, _ := json.Marshal(zerosPayload)
zerosPayloadCiphertext := block.Seal(nil, nonce, zerosPlaintext, nil)

recoveredPlaintext := xor(output, zerosPlaintext)) // {"a": 0, "b": true, "innerPayload": {"secret": "top secret stuff" }}
```

## In the Wild
One of the most widely known cases of this being exploited was the [KRACK or Key Reinstallation Attacks](https://www.krackattacks.com/) that WPA2 was vulnerable to. This was achieved through replaying a previous message 
from the handshake protocol, tricking the client into resetting the nonce (which in this case was a counter associated with the packet number) while keeping the same key in use. The result was the ability for an attacker to recover unknown plaintexts, partially because the structure of transferred packets is known.

## Taking this a step further...
If you can indefinitely force encryption using the same nonce/key, you can repeatedly encrypt plaintexts in an attempt to uncover more information as to the value of the keystream. The same characters/blocks will always encrypt to the same value, so an attacker can methodically work towards uncovering information, perhaps using cribs and/or frequency analysis.  

## Summary
Complete recovery of plaintext material, along with potentially a full key recovery is entire possible through exploiting nonce reuse. 

This is only made possible though by several crucial flaws/characteristics in the underlying protocol:
- Nonce reuse
- Ability for an attacker to encrypt arbitrary ciphertexts (either through impersonation or an oracle)
- Exposure of ciphertext material

Use of ‘vulnerable’ algorithms like AES GCM is not innately insecure, but this does mean those developers must take the steps to consider their implementation against these 3 aforementioned properties. This extends to hardening protocols to manipulation where attackers attempt to introduce these vulnerabilities through message replay or other protocol manipulations.