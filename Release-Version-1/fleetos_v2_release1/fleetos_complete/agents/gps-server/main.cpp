/*
 * Fleet OS — GPS Server  (AGT-001)  v2.2
 * C++ — uses PG wire protocol v3 directly (Unix socket + TCP fallback)
 * No libpq needed — only OpenSSL for MD5 auth
 *
 * Build:
 *   g++ -std=c++17 -O2 -pthread -I/usr/include/node \
 *       -o build/gps-server main.cpp \
 *       /usr/lib/x86_64-linux-gnu/libssl.so.3 \
 *       /usr/lib/x86_64-linux-gnu/libcrypto.so.3
 */

#include <iostream>
#include <sstream>
#include <string>
#include <vector>
#include <map>
#include <thread>
#include <mutex>
#include <atomic>
#include <cstring>
#include <csignal>
#include <algorithm>
#include <cmath>
#include <sys/socket.h>
#include <sys/un.h>
#include <sys/stat.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <netdb.h>
#include <unistd.h>
// ── Config ────────────────────────────────────────────────────────
static std::string Env(const char* k, const char* d){ const char* v=getenv(k); return v?v:d; }
static int         EnvI(const char* k, int d)       { const char* v=getenv(k); return v?std::stoi(v):d; }

static const std::string DB_HOST = Env("FLEETOS_DB_HOST","127.0.0.1");
static const std::string DB_PORT = Env("FLEETOS_DB_PORT","5432");
static const std::string DB_NAME = Env("FLEETOS_DB_NAME","fleetos");
static const std::string DB_USER = Env("FLEETOS_DB_USER","fleetos");
static const std::string DB_PASS = Env("FLEETOS_DB_PASS","fleetos123");
static const int TCP_PORT  = EnvI("GPS_TCP_PORT", 6001);
static const int MGMT_PORT = EnvI("GPS_MGMT_PORT",6002);

// ── Stats ─────────────────────────────────────────────────────────
struct { std::atomic<long> packets{0},written{0},errors{0},skipped{0};
         std::mutex devMu; std::map<std::string,int> devices;
         std::mutex errMu; std::string lastError; } G;

// ── MD5 (inline, no OpenSSL needed) ──────────────────────────────
// Used only for PostgreSQL md5 auth handshake
struct Md5Ctx {
    uint32_t s[4]; uint32_t c[2]; uint8_t buf[64];
    static uint32_t F(uint32_t x,uint32_t y,uint32_t z){return (x&y)|(~x&z);}
    static uint32_t G(uint32_t x,uint32_t y,uint32_t z){return (x&z)|(y&~z);}
    static uint32_t H(uint32_t x,uint32_t y,uint32_t z){return x^y^z;}
    static uint32_t I(uint32_t x,uint32_t y,uint32_t z){return y^(x|~z);}
    static uint32_t R(uint32_t x,int n){return (x<<n)|(x>>(32-n));}
    static const uint32_t* K(){ static const uint32_t k[64]={
        0xd76aa478,0xe8c7b756,0x242070db,0xc1bdceee,0xf57c0faf,0x4787c62a,0xa8304613,0xfd469501,
        0x698098d8,0x8b44f7af,0xffff5bb1,0x895cd7be,0x6b901122,0xfd987193,0xa679438e,0x49b40821,
        0xf61e2562,0xc040b340,0x265e5a51,0xe9b6c7aa,0xd62f105d,0x02441453,0xd8a1e681,0xe7d3fbc8,
        0x21e1cde6,0xc33707d6,0xf4d50d87,0x455a14ed,0xa9e3e905,0xfcefa3f8,0x676f02d9,0x8d2a4c8a,
        0xfffa3942,0x8771f681,0x6d9d6122,0xfde5380c,0xa4beea44,0x4bdecfa9,0xf6bb4b60,0xbebfbc70,
        0x289b7ec6,0xeaa127fa,0xd4ef3085,0x04881d05,0xd9d4d039,0xe6db99e5,0x1fa27cf8,0xc4ac5665,
        0xf4292244,0x432aff97,0xab9423a7,0xfc93a039,0x655b59c3,0x8f0ccc92,0xffeff47d,0x85845dd1,
        0x6fa87e4f,0xfe2ce6e0,0xa3014314,0x4e0811a1,0xf7537e82,0xbd3af235,0x2ad7d2bb,0xeb86d391};
        return k;}
    Md5Ctx(){ s[0]=0x67452301;s[1]=0xefcdab89;s[2]=0x98badcfe;s[3]=0x10325476;c[0]=c[1]=0;}
    void block(const uint8_t* p){
        uint32_t a=s[0],b=s[1],c2=s[2],d=s[3],w[16];
        for(int i=0;i<16;i++) w[i]=((uint32_t)p[4*i])|(((uint32_t)p[4*i+1])<<8)|(((uint32_t)p[4*i+2])<<16)|(((uint32_t)p[4*i+3])<<24);
        const uint32_t* k=K(); int S[]={7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21};
        for(int i=0;i<64;i++){
            uint32_t f,g;
            if(i<16){f=F(b,c2,d);g=i;}
            else if(i<32){f=G(b,c2,d);g=(5*i+1)%16;}
            else if(i<48){f=H(b,c2,d);g=(3*i+5)%16;}
            else{f=I(b,c2,d);g=(7*i)%16;}
            f=f+a+k[i]+w[g]; a=d; d=c2; c2=b; b=b+R(f,S[(i/16)*4+(i%4)]);
        }
        s[0]+=a;s[1]+=b;s[2]+=c2;s[3]+=d;
    }
    void update(const uint8_t* data, size_t len){
        uint32_t lo=c[0]; c[0]+=len<<3; if(c[0]<lo) c[1]++;
        c[1]+=(uint32_t)(len>>29);
        size_t part=(lo>>3)&63;
        if(part){ size_t fill=64-part; if(len<fill){memcpy(buf+part,data,len);return;} memcpy(buf+part,data,fill); block(buf); data+=fill; len-=fill;}
        while(len>=64){block(data);data+=64;len-=64;}
        memcpy(buf,data,len);
    }
    void digest(uint8_t out[16]){
        uint32_t lo=c[0],hi=c[1]; uint8_t pad[64]={0x80};
        uint32_t bits=lo; size_t part=(lo>>3)&63;
        size_t padlen=(part<56)?(56-part):(120-part);
        update(pad,padlen);
        for(int i=0;i<8;i++) pad[i]=(uint8_t)((i<4)?(bits>>(8*i)):(hi>>(8*(i-4))));
        update(pad,8);
        for(int i=0;i<4;i++) for(int j=0;j<4;j++) out[4*i+j]=(uint8_t)(s[i]>>(8*j));
    }
};
static std::string md5hex(const std::string& s){
    Md5Ctx ctx; ctx.update((const uint8_t*)s.data(),s.size());
    uint8_t d[16]; ctx.digest(d);
    char o[33]; for(int i=0;i<16;i++) snprintf(o+2*i,3,"%02x",d[i]); return {o,32};
}

// ── Crypto helpers for SCRAM-SHA-256 ─────────────────────────────
// SHA-256 (minimal, RFC 6234)
static void sha256(const uint8_t* d, size_t n, uint8_t out[32]) {
    // Use kernel /dev/urandom? No — use OpenSSL-free pure C impl.
    // We include it inline. Simplified: use the system libcrypto if available,
    // else fall back to our own. Here we use the POSIX approach via gcrypt or
    // simply reuse our existing MD5 pattern with SHA256.
    // Since we already have md5hex, we'll use a simple iterative SHA-256.
    static const uint32_t K[64]={
        0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
        0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
        0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
        0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
        0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
        0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
        0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
        0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
    };
    uint32_t h[8]={0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19};
    uint64_t bits=(uint64_t)n*8;
    std::vector<uint8_t> msg(d,d+n);
    msg.push_back(0x80);
    while((msg.size()%64)!=56) msg.push_back(0);
    for(int i=7;i>=0;i--) msg.push_back((bits>>(8*i))&0xff);
    for(size_t off=0;off<msg.size();off+=64){
        uint32_t W[64];
        for(int i=0;i<16;i++){
            W[i]=((uint32_t)msg[off+4*i]<<24)|((uint32_t)msg[off+4*i+1]<<16)|
                 ((uint32_t)msg[off+4*i+2]<<8)|msg[off+4*i+3];
        }
        for(int i=16;i<64;i++){
            uint32_t s0=((W[i-15]>>7)|(W[i-15]<<25))^((W[i-15]>>18)|(W[i-15]<<14))^(W[i-15]>>3);
            uint32_t s1=((W[i-2]>>17)|(W[i-2]<<15))^((W[i-2]>>19)|(W[i-2]<<13))^(W[i-2]>>10);
            W[i]=W[i-16]+s0+W[i-7]+s1;
        }
        uint32_t a=h[0],b=h[1],c=h[2],dv=h[3],e=h[4],f=h[5],g=h[6],hv=h[7];
        for(int i=0;i<64;i++){
            uint32_t S1=((e>>6)|(e<<26))^((e>>11)|(e<<21))^((e>>25)|(e<<7));
            uint32_t ch=(e&f)^(~e&g);
            uint32_t t1=hv+S1+ch+K[i]+W[i];
            uint32_t S0=((a>>2)|(a<<30))^((a>>13)|(a<<19))^((a>>22)|(a<<10));
            uint32_t maj=(a&b)^(a&c)^(b&c);
            uint32_t t2=S0+maj;
            hv=g; g=f; f=e; e=dv+t1; dv=c; c=b; b=a; a=t1+t2;
        }
        h[0]+=a;h[1]+=b;h[2]+=c;h[3]+=dv;h[4]+=e;h[5]+=f;h[6]+=g;h[7]+=hv;
    }
    for(int i=0;i<8;i++){out[4*i]=(h[i]>>24)&0xff;out[4*i+1]=(h[i]>>16)&0xff;out[4*i+2]=(h[i]>>8)&0xff;out[4*i+3]=h[i]&0xff;}
}
static void hmac_sha256(const uint8_t* key, size_t klen, const uint8_t* data, size_t dlen, uint8_t out[32]) {
    uint8_t k[64]={}, ipad[64], opad[64];
    if(klen>64){sha256(key,klen,k); klen=32;} else memcpy(k,key,klen);
    for(int i=0;i<64;i++){ipad[i]=k[i]^0x36; opad[i]=k[i]^0x5c;}
    std::vector<uint8_t> inner(64+dlen);
    memcpy(inner.data(),ipad,64); memcpy(inner.data()+64,data,dlen);
    uint8_t ih[32]; sha256(inner.data(),inner.size(),ih);
    std::vector<uint8_t> outer(64+32);
    memcpy(outer.data(),opad,64); memcpy(outer.data()+64,ih,32);
    sha256(outer.data(),outer.size(),out);
}
static void pbkdf2_sha256(const uint8_t* pw,size_t pwlen,const uint8_t* salt,size_t slen,int iters,uint8_t* out) {
    std::vector<uint8_t> buf(slen+4);
    memcpy(buf.data(),salt,slen); buf[slen]=0;buf[slen+1]=0;buf[slen+2]=0;buf[slen+3]=1;
    uint8_t U[32],T[32]={};
    hmac_sha256(pw,pwlen,buf.data(),buf.size(),U);
    for(int i=0;i<32;i++) T[i]=U[i];
    for(int c=1;c<iters;c++){
        hmac_sha256(pw,pwlen,U,32,U);
        for(int i=0;i<32;i++) T[i]^=U[i];
    }
    memcpy(out,T,32);
}
static const std::string B64C="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
static std::string b64encode(const uint8_t* d,size_t n){
    std::string o; int i=0; uint32_t v=0; int bits=0;
    for(size_t j=0;j<n;j++){v=(v<<8)|d[j];bits+=8;while(bits>=6){bits-=6;o+=B64C[(v>>bits)&0x3f];}}
    if(bits>0){v<<=6-bits;o+=B64C[v&0x3f];}
    while(o.size()%4) o+='='; return o;
}
static std::vector<uint8_t> b64decode(const std::string& s){
    std::vector<uint8_t> o; uint32_t v=0; int bits=0;
    for(char c:s){
        if(c=='=') break;
        int n=B64C.find(c); if(n==std::string::npos) continue;
        v=(v<<6)|n; bits+=6; if(bits>=8){bits-=8;o.push_back((v>>bits)&0xff);}
    }
    return o;
}

// ── PG wire-protocol v3 client ────────────────────────────────────
// ── SCRAM-SHA-256 helpers (pure C++17, zero external dependencies) ─
// SHA-256
struct Sha256Ctx {
    uint32_t h[8]; uint64_t bits; uint8_t buf[64]; size_t bufLen;
    static const uint32_t* K(){static const uint32_t k[64]={
        0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
        0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
        0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
        0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
        0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
        0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
        0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
        0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2};return k;}
    static uint32_t rotr(uint32_t x,int n){return (x>>n)|(x<<(32-n));}
    void compress(const uint8_t* blk){
        uint32_t w[64],a=h[0],b=h[1],c=h[2],d=h[3],e=h[4],f=h[5],g=h[6],hh=h[7];
        for(int i=0;i<16;i++) w[i]=((uint32_t)blk[4*i]<<24)|((uint32_t)blk[4*i+1]<<16)|((uint32_t)blk[4*i+2]<<8)|blk[4*i+3];
        for(int i=16;i<64;i++){uint32_t s0=rotr(w[i-15],7)^rotr(w[i-15],18)^(w[i-15]>>3);
            uint32_t s1=rotr(w[i-2],17)^rotr(w[i-2],19)^(w[i-2]>>10);w[i]=w[i-16]+s0+w[i-7]+s1;}
        const uint32_t* K2=K();
        for(int i=0;i<64;i++){
            uint32_t S1=rotr(e,6)^rotr(e,11)^rotr(e,25);
            uint32_t ch=(e&f)^(~e&g);
            uint32_t tmp1=hh+S1+ch+K2[i]+w[i];
            uint32_t S0=rotr(a,2)^rotr(a,13)^rotr(a,22);
            uint32_t maj=(a&b)^(a&c)^(b&c);
            uint32_t tmp2=S0+maj;
            hh=g;g=f;f=e;e=d+tmp1;d=c;c=b;b=a;a=tmp1+tmp2;}
        h[0]+=a;h[1]+=b;h[2]+=c;h[3]+=d;h[4]+=e;h[5]+=f;h[6]+=g;h[7]+=hh;}
    Sha256Ctx(){
        h[0]=0x6a09e667;h[1]=0xbb67ae85;h[2]=0x3c6ef372;h[3]=0xa54ff53a;
        h[4]=0x510e527f;h[5]=0x9b05688c;h[6]=0x1f83d9ab;h[7]=0x5be0cd19;
        bits=0;bufLen=0;}
    void update(const uint8_t* d,size_t n){
        bits+=n*8;
        while(n>0){size_t room=64-bufLen; size_t take=std::min(room,n);
            memcpy(buf+bufLen,d,take);bufLen+=take;d+=take;n-=take;
            if(bufLen==64){compress(buf);bufLen=0;}}}
    void final(uint8_t out[32]){
        buf[bufLen++]=0x80;
        if(bufLen>56){while(bufLen<64)buf[bufLen++]=0;compress(buf);bufLen=0;}
        while(bufLen<56)buf[bufLen++]=0;
        for(int i=7;i>=0;i--){buf[bufLen++]=(uint8_t)(bits>>((7-i?7-(7-i):7)*8+((7-i)?0:0)));}
        // write big-endian bit count
        bufLen=56;
        for(int i=0;i<8;i++) buf[56+i]=(uint8_t)(bits>>((7-i)*8));
        compress(buf);
        for(int i=0;i<8;i++){out[4*i]=(uint8_t)(h[i]>>24);out[4*i+1]=(uint8_t)(h[i]>>16);
            out[4*i+2]=(uint8_t)(h[i]>>8);out[4*i+3]=(uint8_t)h[i];}
    }
};
static void scram_sha256(const uint8_t* d,size_t n,uint8_t out[32]){
    Sha256Ctx c; c.update(d,n); c.final(out);}
static void scram_hmac(const uint8_t* key,size_t kl,const uint8_t* d,size_t dl,uint8_t out[32]){
    uint8_t k[64]={};
    if(kl>64){scram_sha256(key,kl,k);}else{memcpy(k,key,kl);}
    uint8_t ipad[64],opad[64];
    for(int i=0;i<64;i++){ipad[i]=k[i]^0x36;opad[i]=k[i]^0x5c;}
    uint8_t inner[32];
    {Sha256Ctx c;c.update(ipad,64);c.update(d,dl);c.final(inner);}
    {Sha256Ctx c;c.update(opad,64);c.update(inner,32);c.final(out);}}
static void scram_pbkdf2(const uint8_t* pw,size_t pl,const uint8_t* salt,size_t sl,int iters,uint8_t out[32]){
    // PBKDF2-HMAC-SHA256, dklen=32, one block
    uint8_t u[32],buf[32];
    // U1 = PRF(Password, Salt || INT(1))
    std::vector<uint8_t> s1(sl+4);
    memcpy(s1.data(),salt,sl);
    s1[sl]=0;s1[sl+1]=0;s1[sl+2]=0;s1[sl+3]=1;
    scram_hmac(pw,pl,s1.data(),s1.size(),u);
    memcpy(buf,u,32);
    for(int i=1;i<iters;i++){
        uint8_t tmp[32];
        scram_hmac(pw,pl,u,32,tmp);
        for(int j=0;j<32;j++){buf[j]^=tmp[j];u[j]=tmp[j];}
    }
    memcpy(out,buf,32);}

// ── PG wire-protocol v3 client ────────────────────────────────────
struct PgConn {
    int fd_=-1; std::string rbuf_;
    std::string _scramNonce, _scramCFMBare;

    bool fill(size_t n){ while(rbuf_.size()<n){ char t[4096]; ssize_t r=recv(fd_,t,sizeof(t),0); if(r<=0)return false; rbuf_.append(t,(size_t)r);} return true;}
    bool readMsg(char& type,std::string& body){
        if(!fill(5))return false;
        type=rbuf_[0]; uint32_t nl; memcpy(&nl,rbuf_.data()+1,4); uint32_t len=ntohl(nl);
        if(len<4){rbuf_.clear();return false;}
        if(!fill(1+len))return false;
        body=rbuf_.substr(5,len-4); rbuf_.erase(0,1+len); return true;
    }
    void sendMsg(char type,const void* data,size_t sz){
        uint32_t nl=htonl(4+(uint32_t)sz);
        send(fd_,&type,1,MSG_NOSIGNAL); send(fd_,&nl,4,MSG_NOSIGNAL);
        if(sz) send(fd_,data,sz,MSG_NOSIGNAL);
    }
    void sendStartup(){
        std::string b;
        uint32_t p=htonl(196608); b.append((char*)&p,4);
        b.append("user",4);     b+='\0'; b+=DB_USER;  b+='\0';
        b.append("database",8); b+='\0'; b+=DB_NAME;  b+='\0';
        b+='\0'; // terminating zero
        uint32_t t=htonl(4+(uint32_t)b.size());
        send(fd_,&t,4,MSG_NOSIGNAL);
        send(fd_,b.data(),b.size(),MSG_NOSIGNAL);
    }
    bool doAuth(){
        while(true){
            char t; std::string body; if(!readMsg(t,body))return false;
            if(t=='R'){
                uint32_t m; memcpy(&m,body.data(),4); m=ntohl(m);
                if(m==0){/* ok */}
                else if(m==3){ std::string pw=DB_PASS+'\0'; sendMsg('p',pw.data(),pw.size()); }
                else if(m==5){
                    const char* salt=body.data()+4;
                    std::string h="md5"+md5hex(md5hex(DB_PASS+DB_USER)+std::string(salt,4))+'\0';
                    sendMsg('p',h.data(),h.size());
                } else if(m==10){
                    // SCRAM-SHA-256 — send SASLInitialResponse
                    _scramNonce.clear();
                    const std::string chars="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
                    srand((unsigned)time(nullptr)^(unsigned)(uintptr_t)this);
                    for(int i=0;i<24;i++) _scramNonce+=chars[rand()%chars.size()];
                    _scramCFMBare="n="+DB_USER+",r="+_scramNonce;
                    std::string cfm="n,,"+_scramCFMBare;
                    // SASLInitialResponse: 'p' + len + mech\0 + int32(data_len) + data
                    std::string mech="SCRAM-SHA-256";
                    uint32_t dlen=htonl((uint32_t)cfm.size());
                    std::string payload;
                    payload+=mech; payload+='\0';
                    payload.append((char*)&dlen,4);
                    payload+=cfm;
                    sendMsg('p',payload.data(),payload.size());
                } else if(m==11){
                    // SASLContinue — parse challenge, send proof
                    std::string sfm=body.substr(4);
                    // parse r=,s=,i=
                    std::string serverNonce,saltB64,itersStr;
                    std::istringstream ss(sfm);
                    std::string tok;
                    while(std::getline(ss,tok,',')){
                        if(tok.size()>2 && tok[1]=='='){
                            char k=tok[0]; std::string v=tok.substr(2);
                            if(k=='r') serverNonce=v;
                            else if(k=='s') saltB64=v;
                            else if(k=='i') itersStr=v;
                        }
                    }
                    if(serverNonce.substr(0,_scramNonce.size())!=_scramNonce){
                        std::cerr<<"[PG] SCRAM nonce mismatch\n"; return false;
                    }
                    int iters=std::stoi(itersStr);
                    // Base64 decode salt
                    std::vector<uint8_t> salt=b64decode(saltB64);
                    // PBKDF2-SHA256
                    std::vector<uint8_t> saltedPass(32);
                    scram_pbkdf2((const uint8_t*)DB_PASS.data(),DB_PASS.size(),
                                  salt.data(),salt.size(),iters,saltedPass.data());
                    // ClientKey = HMAC(SaltedPass, "Client Key")
                    uint8_t clientKey[32]; scram_hmac(saltedPass.data(),32,(const uint8_t*)"Client Key",10,clientKey);
                    // StoredKey = H(ClientKey)
                    uint8_t storedKey[32]; scram_sha256(clientKey,32,storedKey);
                    // AuthMessage
                    std::string cfm_no_proof="c=biws,r="+serverNonce;
                    std::string authMsg=_scramCFMBare+","+sfm+","+cfm_no_proof;
                    // ClientSignature = HMAC(StoredKey, AuthMessage)
                    uint8_t clientSig[32]; scram_hmac(storedKey,32,(const uint8_t*)authMsg.data(),authMsg.size(),clientSig);
                    // ClientProof = ClientKey XOR ClientSig
                    uint8_t proof[32]; for(int i=0;i<32;i++) proof[i]=clientKey[i]^clientSig[i];
                    std::string proofB64=b64encode(proof,32);
                    std::string finalMsg=cfm_no_proof+",p="+proofB64;
                    sendMsg('p',finalMsg.data(),finalMsg.size());
                } else if(m==12){
                    // SASLFinal — server verifies; we accept
                } else {
                    std::cerr<<"[PG] Unsupported auth "<<m<<"\n"<<std::flush;
                    return false;
                }
            } else if(t=='E'){
                std::string msg; size_t i=1;
                while(i<body.size()){ char f=body[i++]; size_t e=body.find('\0',i); if(e==std::string::npos)break; if(f=='M')msg=body.substr(i,e-i); i=e+1;}
                std::cerr<<"[PG] Auth: "<<msg<<"\n"<<std::flush; return false;
            } else if(t=='Z') return true;
        }
    }
    bool tryUnix(const std::string& path){
        struct stat st; if(stat(path.c_str(),&st)!=0)return false;
        struct sockaddr_un sa{}; sa.sun_family=AF_UNIX; strncpy(sa.sun_path,path.c_str(),sizeof(sa.sun_path)-1);
        int f=socket(AF_UNIX,SOCK_STREAM,0); if(f<0)return false;
        struct timeval tv={5,0}; setsockopt(f,SOL_SOCKET,SO_RCVTIMEO,&tv,sizeof(tv)); setsockopt(f,SOL_SOCKET,SO_SNDTIMEO,&tv,sizeof(tv));
        if(::connect(f,(sockaddr*)&sa,sizeof(sa))!=0){close(f);return false;}
        fd_=f; return true;
    }
    bool tryTcp(){
        struct addrinfo hints{},*res; hints.ai_family=AF_INET; hints.ai_socktype=SOCK_STREAM;
        if(getaddrinfo(DB_HOST.c_str(),DB_PORT.c_str(),&hints,&res)!=0)return false;
        int f=socket(res->ai_family,res->ai_socktype,0); if(f<0){freeaddrinfo(res);return false;}
        struct timeval tv={5,0}; setsockopt(f,SOL_SOCKET,SO_RCVTIMEO,&tv,sizeof(tv)); setsockopt(f,SOL_SOCKET,SO_SNDTIMEO,&tv,sizeof(tv));
        if(::connect(f,res->ai_addr,res->ai_addrlen)!=0){freeaddrinfo(res);close(f);return false;}
        freeaddrinfo(res); fd_=f; return true;
    }
public:
    bool connect(){
        if(fd_>=0){close(fd_);fd_=-1;} rbuf_.clear();
        // Always use TCP — Unix socket triggers peer auth which requires matching OS user
        if(!tryTcp()){
            std::cerr<<"[PG] Cannot reach "<<DB_HOST<<":"<<DB_PORT<<"\n"
                     <<"  Run: sudo systemctl start postgresql\n"<<std::flush;
            return false;
        }
        std::cout<<"[PG] TCP "<<DB_HOST<<":"<<DB_PORT<<"\n"<<std::flush;
        sendStartup(); return doAuth();
    }
    bool ok() const { return fd_>=0; }
    bool ensureConn(){ return fd_>=0 || connect(); }
    bool exec(const std::string& sql){
        if(!ensureConn())return false;
        std::string q=sql+'\0'; uint32_t nl=htonl(4+(uint32_t)q.size()); char qt='Q';
        send(fd_,&qt,1,MSG_NOSIGNAL); send(fd_,&nl,4,MSG_NOSIGNAL); send(fd_,q.data(),q.size(),MSG_NOSIGNAL);
        bool good=false;
        while(true){
            char t; std::string body; if(!readMsg(t,body)){close(fd_);fd_=-1;return false;}
            if(t=='C'||t=='I') good=true;
            if(t=='E'){
                std::string msg; size_t i=1;
                while(i<body.size()){ char f=body[i++]; size_t e=body.find('\0',i); if(e==std::string::npos)break; if(f=='M')msg=body.substr(i,e-i); i=e+1;}
                while(!msg.empty()&&(msg.back()=='\n'||msg.back()=='\r'))msg.pop_back();
                {std::lock_guard<std::mutex> lk(G.errMu); G.lastError=msg;}
                std::cerr<<"[SQL] "<<msg<<"\n"<<std::flush; good=false;
            }
            if(t=='Z') break;
        }
        return good;
    }
    std::string queryOne(const std::string& sql){
        if(!ensureConn())return "";
        std::string q=sql+'\0'; uint32_t nl=htonl(4+(uint32_t)q.size()); char qt='Q';
        send(fd_,&qt,1,MSG_NOSIGNAL); send(fd_,&nl,4,MSG_NOSIGNAL); send(fd_,q.data(),q.size(),MSG_NOSIGNAL);
        std::string result;
        while(true){ char t; std::string body; if(!readMsg(t,body))break;
            if(t=='D'&&body.size()>=6){ int32_t vl; memcpy(&vl,body.data()+2,4); vl=(int32_t)ntohl((uint32_t)vl); if(vl>0)result=body.substr(6,(size_t)vl);}
            if(t=='Z')break;}
        return result;
    }
    ~PgConn(){if(fd_>=0)close(fd_);}
};

// ── Flat JSON parser ──────────────────────────────────────────────
struct JMap {
    std::map<std::string,std::string> kv;
    bool parse(const std::string& s){
        kv.clear(); size_t i=0,n=s.size();
        while(i<n&&s[i]!='{')i++; if(i==n)return false; i++;
        while(i<n){
            while(i<n&&(s[i]==' '||s[i]=='\t'||s[i]=='\n'||s[i]=='\r'||s[i]==','))i++;
            if(i>=n||s[i]=='}')break;
            if(s[i]!='"')return false; i++;
            size_t ks=i; while(i<n&&s[i]!='"'){if(s[i]=='\\')i++;i++;} std::string key=s.substr(ks,i-ks); if(i<n)i++;
            while(i<n&&(s[i]==' '||s[i]==':'))i++;
            std::string val;
            if(i<n&&s[i]=='"'){ i++; size_t vs=i; while(i<n&&!(s[i]=='"'&&s[i-1]!='\\'))i++; val=s.substr(vs,i-vs); if(i<n)i++; }
            else { size_t vs=i; while(i<n&&s[i]!=','&&s[i]!='}'&&s[i]!=' '&&s[i]!='\n')i++; val=s.substr(vs,i-vs);}
            kv[key]=val;
        }
        return !kv.empty();
    }
    std::string get(const std::string& k,const std::string& d="")const{ auto it=kv.find(k); return it==kv.end()?d:it->second;}
    bool has(const std::string& k)const{return kv.count(k)>0;}
};

static std::string sq(const std::string& s){
    std::string o; o+='\''; for(char c:s){if(c=='\'')o+='\''; o+=c;} o+='\''; return o;
}

// ── Write position ────────────────────────────────────────────────
bool writePos(PgConn& pg, const JMap& j, const std::string& raw){
    auto imei=j.get("imei"), latS=j.get("lat",j.get("latitude","")),lonS=j.get("lon",j.get("longitude",""));
    auto spdS=j.get("speed","0"),hdgS=j.get("heading",j.get("course","0")),altS=j.get("altitude","0");
    auto satS=j.get("satellites","0"),proto=j.get("protocol","JSON_SIM"),ts=j.get("ts","");
    if(imei.empty()||latS.empty()||lonS.empty()){G.skipped++;return false;}
    double lat=0,lon=0; try{lat=std::stod(latS);lon=std::stod(lonS);}catch(...){G.skipped++;return false;}
    if(lat==0&&lon==0){G.skipped++;return false;}
    std::string rawEsc; for(char c:raw){if(c=='\'')rawEsc+='\'';rawEsc+=c;}
    std::string tsPart=ts.empty()?"NOW()":"'"+ts+"'";
    std::ostringstream sql;
    sql<<"INSERT INTO gps_positions(imei,latitude,longitude,speed,heading,altitude,satellites,protocol,ts,raw_data)"
       <<" VALUES("<<sq(imei)<<","<<latS<<"::float8,"<<lonS<<"::float8,"<<spdS<<"::float8,"
       <<hdgS<<"::int,"<<altS<<"::float8,"<<satS<<"::int,"<<sq(proto)<<","<<tsPart<<",'"<<rawEsc<<"'::jsonb)";
    bool ok=pg.exec(sql.str());
    if(ok){
        G.written++; {std::lock_guard<std::mutex> lk(G.devMu); G.devices[imei]++;}
        std::cout<<"[✓] "<<imei<<" lat="<<lat<<" lon="<<lon<<" spd="<<spdS<<" total="<<G.written<<"\n"<<std::flush;
        if(j.has("odometer")) pg.exec("UPDATE devices SET odometer="+j.get("odometer")+"::float8 WHERE imei="+sq(imei));
        std::string aval=j.get("alarm","false"); bool hasA=(aval=="true"||aval=="1");
        double spd=0; try{spd=std::stod(spdS);}catch(...){}
        std::string at; if(hasA) at=spd>80?"OVERSPEED":"PANIC"; if(spd>100)at="OVERSPEED";
        if(!hasA&&aval!="false"&&aval!="0"&&aval.size()>1)at=aval;
        for(auto& c:at)c=(char)toupper(c);
        if(!at.empty()){
            std::string sev=spd>120?"HIGH":"MEDIUM";
            std::ostringstream as; as<<"INSERT INTO gps_alarms(imei,alarm_type,severity,latitude,longitude,ts)"
              <<" VALUES("<<sq(imei)<<","<<sq(at)<<","<<sq(sev)<<","<<latS<<"::float8,"<<lonS<<"::float8,"<<tsPart<<")";
            pg.exec(as.str()); std::cout<<"[ALARM] "<<imei<<" "<<at<<"\n";
        }
    } else G.errors++;
    return ok;
}

// ── TCP client ────────────────────────────────────────────────────
void handleClient(int fd, std::string addr){
    std::cout<<"[+] "<<addr<<"\n"<<std::flush;
    PgConn pg; std::string partial,imei; char buf[4096];
    struct timeval tv={60,0}; setsockopt(fd,SOL_SOCKET,SO_RCVTIMEO,&tv,sizeof(tv));
    while(true){
        ssize_t n=recv(fd,buf,sizeof(buf)-1,0); if(n<=0)break;
        buf[n]=0; G.packets++;
        if((uint8_t)buf[0]==0x78&&(uint8_t)buf[1]==0x78&&n>=4){
            if((uint8_t)buf[3]==0x01&&n>=18){
                imei.clear(); char tmp[3];
                for(int k=4;k<12;k++){snprintf(tmp,3,"%02X",(uint8_t)buf[k]);imei+=tmp[0];imei+=tmp[1];}
                imei=imei.substr(0,15); std::cout<<"[GT06N] imei="<<imei<<"\n"<<std::flush;
                uint8_t ack[]={0x78,0x78,0x05,0x01,0x00,0x01,0x00,0xD9,0x0D,0x0A};
                send(fd,ack,sizeof(ack),MSG_NOSIGNAL);
            }
            continue;
        }
        partial+=std::string(buf,(size_t)n);
        size_t pos;
        while((pos=partial.find('\n'))!=std::string::npos){
            std::string line=partial.substr(0,pos); partial=partial.substr(pos+1);
            if(!line.empty()&&line.back()=='\r')line.pop_back(); if(line.empty())continue;
            if(line[0]=='{'){
                JMap j; if(!j.parse(line)){std::cerr<<"[JSON?] "<<line.substr(0,60)<<"\n";continue;}
                if(!j.get("imei").empty())imei=j.get("imei");
                std::cout<<"[PKT] imei="<<j.get("imei")<<" lat="<<j.get("lat")<<" lon="<<j.get("lon")<<" spd="<<j.get("speed")<<"\n"<<std::flush;
                if(writePos(pg,j,line)){const char* a="{\"ack\":1}\n";send(fd,a,strlen(a),MSG_NOSIGNAL);}
            } else if(line.size()>=6&&line.substr(0,6)=="$GPRMC"){
                std::vector<std::string> f; std::istringstream ss(line); std::string tok;
                while(std::getline(ss,tok,','))f.push_back(tok);
                if(f.size()>=9&&f[2]=="A"&&!imei.empty()){
                    double rl=std::stod(f[3]),ll=std::stod(f[5]); JMap j;
                    j.kv["imei"]=imei; j.kv["lat"]=std::to_string(floor(rl/100)+fmod(rl,100)/60);
                    j.kv["lon"]=std::to_string(floor(ll/100)+fmod(ll,100)/60);
                    j.kv["speed"]=std::to_string(std::stod(f[7])*1.852); j.kv["heading"]=f[8]; j.kv["protocol"]="AIS140";
                    writePos(pg,j,line);
                }
            }
        }
    }
    close(fd); std::cout<<"[-] "<<addr<<" imei="<<imei<<"\n"<<std::flush;
}

// ── Mgmt HTTP ─────────────────────────────────────────────────────
void mgmtServer(){
    int srv=socket(AF_INET,SOCK_STREAM,0); int opt=1; setsockopt(srv,SOL_SOCKET,SO_REUSEADDR,&opt,sizeof(opt));
    sockaddr_in sa{}; sa.sin_family=AF_INET; sa.sin_addr.s_addr=INADDR_ANY; sa.sin_port=htons(MGMT_PORT);
    bind(srv,(sockaddr*)&sa,sizeof(sa)); listen(srv,8);
    while(true){
        int cl=accept(srv,nullptr,nullptr); if(cl<0)continue;
        char req[512]; recv(cl,req,sizeof(req),0);
        std::ostringstream j;
        {std::lock_guard<std::mutex> lk(G.devMu);
         j<<"{\"status\":\"RUNNING\",\"tcp\":"<<TCP_PORT<<",\"packets\":"<<G.packets
          <<",\"written\":"<<G.written<<",\"errors\":"<<G.errors<<",\"skipped\":"<<G.skipped
          <<",\"device_count\":"<<G.devices.size()<<",\"devices\":[";
         bool first=true; for(auto&[k,v]:G.devices){if(!first)j<<",";j<<'"'<<k<<'"';first=false;} j<<"]";}
        {std::lock_guard<std::mutex> lk(G.errMu); if(!G.lastError.empty())j<<",\"last_error\":\""<<G.lastError<<"\"";}
        j<<"}";
        std::string body=j.str();
        std::string resp="HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: "
            +std::to_string(body.size())+"\r\nConnection: close\r\n\r\n"+body;
        send(cl,resp.c_str(),resp.size(),MSG_NOSIGNAL); close(cl);
    }
}

// ── Main ──────────────────────────────────────────────────────────
volatile sig_atomic_t g_stop=0;
void on_sig(int){g_stop=1;}

int main(){
    signal(SIGINT,on_sig); signal(SIGTERM,on_sig); signal(SIGPIPE,SIG_IGN);
    std::cout<<"\n  ╔══════════════════════════════════════════════╗\n"
               "  ║  Fleet OS GPS Server (C++) — AGT-001         ║\n"
               "  ╚══════════════════════════════════════════════╝\n"
             <<"  TCP  → 0.0.0.0:"<<TCP_PORT<<"\n"
             <<"  Mgmt → http://localhost:"<<MGMT_PORT<<"\n"
             <<"  DB   → "<<DB_USER<<"@"<<DB_HOST<<":"<<DB_PORT<<"/"<<DB_NAME<<"\n\n";

    {
        PgConn pg;
        if(!pg.connect()){
            std::cerr<<"  ❌ DB connection failed — run: bash fix-db.sh\n\n"<<std::flush;
        } else {
            std::string cnt=pg.queryOne("SELECT COUNT(*) FROM gps_positions");
            std::cout<<"  ✅ DB connected — gps_positions has "<<cnt<<" rows\n";
            bool ok=pg.exec("INSERT INTO gps_positions(imei,latitude,longitude,speed,protocol,ts) VALUES('_BOOT_',12.97,77.59,0,'BOOT',NOW())")
                 && pg.exec("DELETE FROM gps_positions WHERE imei='_BOOT_'");
            std::cout<<(ok?"  ✅ DB write test PASSED\n\n":"  ❌ DB write test FAILED — run: bash fix-db.sh\n\n");
        }
    }

    std::thread(mgmtServer).detach();

    int srv=socket(AF_INET,SOCK_STREAM,0); if(srv<0){perror("socket");return 1;}
    int opt=1; setsockopt(srv,SOL_SOCKET,SO_REUSEADDR,&opt,sizeof(opt));
    sockaddr_in sa{}; sa.sin_family=AF_INET; sa.sin_addr.s_addr=INADDR_ANY; sa.sin_port=htons(TCP_PORT);
    if(bind(srv,(sockaddr*)&sa,sizeof(sa))<0){
        std::cerr<<"  ❌ Port "<<TCP_PORT<<" already in use — pkill -f gps-server\n"; return 1;}
    listen(srv,32);
    std::cout<<"  ✅ Listening for GPS packets on TCP :"<<TCP_PORT<<"\n\n";

    while(!g_stop){
        sockaddr_in ca{}; socklen_t cl=sizeof(ca);
        int fd=accept(srv,(sockaddr*)&ca,&cl); if(fd<0)continue;
        char ip[INET_ADDRSTRLEN]; inet_ntop(AF_INET,&ca.sin_addr,ip,sizeof(ip));
        std::string addr=std::string(ip)+":"+std::to_string(ntohs(ca.sin_port));
        std::thread([fd,addr]{handleClient(fd,addr);}).detach();
    }
    close(srv); return 0;
}
