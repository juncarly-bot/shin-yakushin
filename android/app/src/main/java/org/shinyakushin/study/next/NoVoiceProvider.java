package org.shinyakushin.study.next;
public final class NoVoiceProvider implements VoiceProvider {
 public byte[] render(String text,String speaker){return null;}
 public String identity(){return "none";}
 public void close(){}
}
