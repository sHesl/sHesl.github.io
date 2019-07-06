# 2018-05-06: Notes on Implementing ECDSA/HMAC
Go has great stdlib support for both symmertic and asymmetric message signing (in the form of crypto/hmac and crypto/ecdsa respectively), but there are a few more things to consider other than just the base primatives when using these packages in the wild. In this post, I'll give a brief outline of these other considerations we should acknowledge, specifically when attempting to sign HTTP requests using ECDSA, even though lots of the points outlined are also applicable to HMACs.  

## A Quick ECDSA Primer
Digital signatures are used to verify both the integrity (that the request has not been modified during transmission) and authorisation (verifying the identity of the sender) of some information. The unique [mathmatical properties of elliptical curves](https://blog.cloudflare.com/a-relatively-easy-to-understand-primer-on-elliptic-curve-cryptography/) gives us a unique trapdoor (easy one way, near impossible to reverse) function that gives us the assurance only an actor with the private component will be able to produce a valid signature.

**Knowing this, we can sign a request with following process:**
- A digest is calcuated from all the key components of our request (i.e everything that impacts the way our server will handle the request)
- Said digest is signed with a the private ECDSA key
- This signature and any addition details are attached to the request (typically as headers) for verification

**A request can then be verified by replicating this process, and comparing with the provided signature:**
- The digest is calculated using the exact same method as the signer used
- The provided signature is recalculated/verified using the public ECDSA key
- The signature is valid if the verifier confirms that the provided signature could have only be produced by someone in possession of the corresponding ECDSA private key.
 
The key to a working implementation here is to guarantee that the digest process is identical between signer/verifier; even a single byte difference in one element of the digest will produce a false negative during verification. The order, casing and values used to produce the digest are paramount, as well as both sender and receiver agreeing upon a method for handling the produced signature.

## Thinking like Mallory
Before we talk about producing a message digest, let's imagine we are sending these requests unencrypted, and that Mallory has access to both see, and manipulate these requests in transit. In which ways could she alter the original request for her mallicious benefit?

**She could alter the:**
- HTTP Method - e.g turning a HTTP GET to a HTTP DELETE
- URL - e.g changing `v1/create` to `v1/delete`, `customer/123` to `customer/234`, or manipulating a query string
- Request Body - e.g changing `{"accountCode": 123456}` to `{"accountCode": 234567}`
- Request Headers - e.g changing the `Authorization` header to swap Alice's token for Mallory's
- Replay - e.g replaying a previous request, perhaps duplicating a previously successful bank transfer
- Delay - e.g intercepting a request and delaying it's reception until a later date (perhaps in co-ordination with another phase of an attack)

We need to ensure that, in addition to secure cryptographic primiatives, our protocol protects us from each and every one of these considerations. The key here is to include all these properties into our digest, as well as introducing some new values to the message, before signing.

## Hashing all key request properties
Ideally, we'd just like to hash absolutely everything in our request, this way we can be sure nothing has changed in transit. Unfortunately, the real world gets in the way here. Mostly, request headers can be added, removed, case modified or straight up renamed by intrusive HTTP frameworks/load balancers. Many headers won't actually modify the behaviour of the server, but there are some that definitely will (like an Authorization header), which we will certainly want to include in our digest. Headers aren't the only thing that might be modified; protocols can be upgraded/downgraded, proxies can interfere with origins etc. In reality, we need to be able to configure exactly what is and isn't considered in our digest, while also ensuring the things that definitely _should_ be considered always are.

## Nonces
Ensuring that requests can not replayed is easily achieved by providing a nonce that is used in the message digest. Any random []byte will suffice, the longer and 'randomer' the better. Not only should our signer be sure to include a nonce, our verifier needs to keep track of which nonces it has seen so it can reject any requests containing a previously used nonce. One last consideration is to expire these 'seen nonces' with in a resonable time frame so we don't eventually use up all of our valid nonces.

## Timestamps
Including the timestamp is another easy addition to our digest, giving us the ability to reject messages that are either too premature or overdue. We do need to be wary of clock-drift though, as you can't guarantee your sender and receiver will maintain syncronicity.

## Putting it all together
Considering all these elements, and ensuring that both signer and verifier are performing the same operations makes implementing message signing a more time-consuming task, but they aren't something that should be overlooked. If your system is sensitive enough to require message signing, (preferably in addition to TLS via signed certificates!), you should absolutely consider these additions when implementing HMAC/ECDSA. 

