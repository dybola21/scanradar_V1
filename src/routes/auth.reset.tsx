import {createFileRoute, Link} from "@tanstack/react-router";
import {useEffect,useState} from "react";
import {supabase} from "@/integrations/supabase/client";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
export const Route = createFileRoute("/auth/reset")({ssr:false,component:ResetPassword});
function ResetPassword(){
 const [ready,setReady]=useState(false),[password,setPassword]=useState(""),[confirm,setConfirm]=useState("");
 const [message,setMessage]=useState("Verificando o link de recuperação…"),[busy,setBusy]=useState(false),[done,setDone]=useState(false);
 useEffect(()=>{let active=true; void supabase.auth.getUser().then(({data,error})=>{if(!active)return;setReady(!!data.user&&!error);setMessage(data.user&&!error?"Escolha sua nova senha.":"O link expirou ou é inválido. Solicite uma nova recuperação.");});return()=>{active=false;};},[]);
 async function submit(event:React.FormEvent){event.preventDefault();if(busy)return;if(password.length<8||password!==confirm){setMessage("Use pelo menos 8 caracteres e confirme a mesma senha.");return;}setBusy(true);
 try{const {error}=await supabase.auth.updateUser({password});if(error)throw error;setDone(true);setReady(false);setMessage("Senha atualizada. Entre usando a nova senha.");await supabase.auth.signOut();}catch{setMessage("Não foi possível atualizar a senha. Solicite um novo link e tente novamente.");}finally{setBusy(false);}}
 return <main className="min-h-dvh flex items-center justify-center bg-slate-50 p-6"><section className="w-full max-w-md space-y-5 rounded-2xl border bg-white p-8"><h1 className="text-2xl font-semibold">Recuperar senha</h1><p role="status">{message}</p>{ready&&!done&&<form onSubmit={submit} className="space-y-4"><label className="block">Nova senha<Input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)}/></label><label className="block">Confirme a senha<Input type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><Button disabled={busy}>{busy?"Salvando…":"Salvar senha"}</Button></form>}<Link to="/auth" className="block underline">Voltar para entrar</Link></section></main>;
}
