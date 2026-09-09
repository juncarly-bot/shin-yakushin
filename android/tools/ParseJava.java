import javax.tools.*;
import com.sun.source.util.JavacTask;
import java.util.*;
public class ParseJava {
 public static void main(String[] args) throws Exception {
  JavaCompiler compiler=ToolProvider.getSystemJavaCompiler();
  DiagnosticCollector<JavaFileObject> diagnostics=new DiagnosticCollector<>();
  try(StandardJavaFileManager files=compiler.getStandardFileManager(diagnostics,null,null)) {
   JavacTask task=(JavacTask)compiler.getTask(null,files,diagnostics,List.of("-proc:none"),null,files.getJavaFileObjects(args));
   task.parse();
   for(var d:diagnostics.getDiagnostics())System.out.println(d);
   if(diagnostics.getDiagnostics().stream().anyMatch(d->d.getKind()==Diagnostic.Kind.ERROR))System.exit(1);
   System.out.println("PASS: Java syntax parsing only. Android symbol/type compilation NOT verified.");
  }
 }
}
