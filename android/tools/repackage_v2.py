#!/usr/bin/env python3
"""Repair the preview APK without replacing any official VOICEVOX payload.

This fallback is used only when the Android SDK is unavailable. It updates web
assets, replaces the accidental build-machine DT_NEEDED path in the already
compiled JNI library, aligns stored ZIP entries, and creates a real APK v2
signature. A newly generated debug key is kept outside the source archive.
"""
from __future__ import annotations
import argparse, hashlib, io, os, struct, zipfile
from pathlib import Path
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.x509.oid import NameOID
from datetime import datetime, timedelta, timezone

APK_SIG_MAGIC=b"APK Sig Block 42"
V2_ID=0x7109871A
RSA_PKCS1_SHA256=0x0103
CHUNK=1024*1024

def u32(n): return struct.pack('<I',n)
def u64(n): return struct.pack('<Q',n)
def lp(b): return u32(len(b))+b
def seq(*items): return lp(b''.join(lp(x) for x in items))

def keypair(directory:Path):
    directory.mkdir(parents=True,exist_ok=True)
    key_path=directory/'debug-signing-key.pem'; cert_path=directory/'debug-signing-cert.der'
    if key_path.exists() and cert_path.exists():
        key=serialization.load_pem_private_key(key_path.read_bytes(),password=None)
        cert=cert_path.read_bytes()
        return key,cert
    key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
    name=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'Shin Yakushin isolated debug')])
    cert_obj=(x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
              .serial_number(x509.random_serial_number()).not_valid_before(datetime.now(timezone.utc)-timedelta(days=1))
              .not_valid_after(datetime.now(timezone.utc)+timedelta(days=3650))
              .sign(key,hashes.SHA256()))
    key_path.write_bytes(key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
    os.chmod(key_path,0o600);cert=cert_obj.public_bytes(serialization.Encoding.DER);cert_path.write_bytes(cert)
    return key,cert

def repair_needed(data:bytes)->bytes:
    marker=b'/workspace/scratch/'
    positions=[];start=0
    while True:
        i=data.find(marker,start)
        if i<0:break
        end=data.find(b'libvoicevox_core.so\0',i)
        if end<0:break
        end+=len(b'libvoicevox_core.so')
        positions.append((i,end));start=end
    if len(positions)!=1: raise ValueError(f'expected one absolute VOICEVOX dependency, found {len(positions)}')
    a,b=positions[0];replacement=b'libvoicevox_core.so'
    return data[:a]+replacement+b'\0'*(b-a-len(replacement))+data[b:]

def aligned_extra(offset:int,name:bytes,stored:bool)->bytes:
    if not stored:return b''
    for n in range(4):
        extra=struct.pack('<HH',0xCAFE,n)+b'\0'*n
        if (offset+30+len(name)+len(extra))%4==0:return extra
    raise AssertionError

def rebuild(source:Path,project:Path,unsigned:Path):
    replacements={f'assets/{name}':(project/'app/src/main/assets'/name).read_bytes() for name in
                  ['conversation.js','conversation-shape.js','companion.js','templates.js','ui.js','style.css']}
    with zipfile.ZipFile(source) as zin, open(unsigned,'wb') as raw:
      with zipfile.ZipFile(raw,'w',allowZip64=True) as zout:
        for old in zin.infolist():
            data=replacements.get(old.filename,zin.read(old.filename))
            if old.filename.endswith('/libstudy_voice.so'):data=repair_needed(data)
            zi=zipfile.ZipInfo(old.filename,date_time=(1981,1,1,1,1,0));zi.compress_type=old.compress_type
            zi.external_attr=old.external_attr;zi.flag_bits=old.flag_bits;zi.create_system=old.create_system
            zi.extra=aligned_extra(raw.tell(),old.filename.encode('utf-8'),old.compress_type==zipfile.ZIP_STORED)
            zout.writestr(zi,data,compress_type=old.compress_type,compresslevel=9)

def sections(unsigned:bytes):
    eocd=unsigned.rfind(b'PK\x05\x06');
    if eocd<0 or len(unsigned)-eocd>65557:raise ValueError('EOCD not found')
    cd=struct.unpack_from('<I',unsigned,eocd+16)[0]
    return unsigned[:cd],unsigned[cd:eocd],bytearray(unsigned[eocd:]),cd

def content_digest(parts):
    chunks=[]
    for part in parts:
        for i in range(0,len(part),CHUNK):
            c=part[i:i+CHUNK];chunks.append(hashlib.sha256(b'\xA5'+u32(len(c))+c).digest())
    return hashlib.sha256(b'\x5A'+u32(len(chunks))+b''.join(chunks)).digest()

def signer_value(key,cert,digest):
    digest_record=u32(RSA_PKCS1_SHA256)+lp(digest)
    signed_data=seq(digest_record)+seq(cert)+lp(b'')
    signature=key.sign(signed_data,padding.PKCS1v15(),hashes.SHA256())
    signature_record=u32(RSA_PKCS1_SHA256)+lp(signature)
    public=key.public_key().public_bytes(serialization.Encoding.DER,serialization.PublicFormat.SubjectPublicKeyInfo)
    signer=lp(signed_data)+seq(signature_record)+lp(public)
    return seq(signer)

def signing_block(value):
    pair=u64(4+len(value))+u32(V2_ID)+value
    size=len(pair)+24
    return u64(size)+pair+u64(size)+APK_SIG_MAGIC

def sign(unsigned_path:Path,output:Path,key,cert):
    raw=unsigned_path.read_bytes();before,central,eocd,cd=sections(raw)
    placeholder=signing_block(signer_value(key,cert,b'\0'*32))
    digest_eocd=bytearray(eocd);struct.pack_into('<I',digest_eocd,16,cd)
    digest=content_digest([before,central,bytes(digest_eocd)])
    block=signing_block(signer_value(key,cert,digest));assert len(block)==len(placeholder)
    struct.pack_into('<I',eocd,16,cd+len(block))
    output.write_bytes(before+block+central+eocd)

def take_lp(data:bytes,offset:int):
    size=struct.unpack_from('<I',data,offset)[0];start=offset+4;return data[start:start+size],start+size

def verify(apk:Path,cert:bytes):
    raw=apk.read_bytes();eocd=raw.rfind(b'PK\x05\x06');cd=struct.unpack_from('<I',raw,eocd+16)[0]
    if raw[cd-16:cd]!=APK_SIG_MAGIC:raise ValueError('APK signing block missing')
    size=struct.unpack_from('<Q',raw,cd-24)[0];start=cd-(size+8);assert struct.unpack_from('<Q',raw,start)[0]==size
    pair_len=struct.unpack_from('<Q',raw,start+8)[0];pair=raw[start+16:start+16+pair_len];assert struct.unpack_from('<I',pair,0)[0]==V2_ID
    signers,_=take_lp(pair,4);signer,_=take_lp(signers,0);signed_data,pos=take_lp(signer,0);signatures,pos=take_lp(signer,pos);public,_=take_lp(signer,pos)
    signature_record,_=take_lp(signatures,0);assert struct.unpack_from('<I',signature_record,0)[0]==RSA_PKCS1_SHA256;signature,_=take_lp(signature_record,4)
    digests,pos=take_lp(signed_data,0);certificates,pos=take_lp(signed_data,pos);additional,_=take_lp(signed_data,pos);assert additional==b''
    digest_record,_=take_lp(digests,0);assert struct.unpack_from('<I',digest_record,0)[0]==RSA_PKCS1_SHA256;expected,_=take_lp(digest_record,4)
    embedded_cert,_=take_lp(certificates,0);assert embedded_cert==cert
    parsed=x509.load_der_x509_certificate(cert);assert public==parsed.public_key().public_bytes(serialization.Encoding.DER,serialization.PublicFormat.SubjectPublicKeyInfo)
    parsed.public_key().verify(signature,signed_data,padding.PKCS1v15(),hashes.SHA256())
    digest_eocd=bytearray(raw[eocd:]);struct.pack_into('<I',digest_eocd,16,start)
    assert expected==content_digest([raw[:start],raw[cd:eocd],bytes(digest_eocd)])
    with zipfile.ZipFile(apk) as z:
        assert z.testzip() is None
        for abi in ('arm64-v8a','x86_64'):
            lib=z.read(f'lib/{abi}/libstudy_voice.so')
            assert b'/workspace/' not in lib and b'libvoicevox_core.so\0' in lib
        assert z.read('assets/companion.js').startswith(b"import {stateOf,relevantRecall}")
    return hashlib.sha256(apk.read_bytes()).hexdigest(),parsed.fingerprint(hashes.SHA256()).hex()

def main():
    p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('project',type=Path);p.add_argument('output',type=Path);p.add_argument('--key-dir',type=Path,required=True);a=p.parse_args()
    a.output.parent.mkdir(parents=True,exist_ok=True);unsigned=a.output.with_suffix('.unsigned.apk');rebuild(a.source,a.project,unsigned)
    key,cert=keypair(a.key_dir);sign(unsigned,a.output,key,cert);sha,cert_sha=verify(a.output,cert)
    print(f'APK {a.output} {a.output.stat().st_size} bytes SHA-256 {sha}')
    print(f'Debug certificate SHA-256 {cert_sha}')

if __name__=='__main__':main()
