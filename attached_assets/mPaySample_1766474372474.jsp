<%@ page contentType="text/html; charset=euc-kr"%>
<%@ page import="java.util.Date" %>
<%@ page import="java.text.SimpleDateFormat" %>
<%@ page import="java.security.MessageDigest" %>
<%@ page import="org.apache.commons.codec.binary.Hex" %>
<%
/*
*******************************************************
* <������û �Ķ����>
* ������ Form �� ������ ������û �Ķ�����Դϴ�.
*******************************************************
*/
String merchantKey 		= "2d6ECGhR1pg/1QGE1lcRI4awsWEgshjEyI8UgYslLPJSuNeyPTkdrT8XWARezvDTUJClWQWhjxzBbu7AsuLZqg==";			                // ������ ���� ����Ű
String merchantID 		= "kistest00m"; 			    // ���������̵�
String goodsNm	 		= "KISPG";	 					// ������ǰ��
String goodsAmt			= "1004"; 						// ������ǰ�ݾ�	
String ordNm 			= "KISPG"; 						// �����ڸ�
String ordTel 			= "01000000000"; 				// �����ڿ���ó
String ordEmail 		= "kispg@kispg.com";			// �����ڸ����ּ�
String ordNo 			= "kispg1234567890"; 			// ��ǰ�ֹ���ȣ	
/*
*******************************************************
* <�ؽ���ȣȭ> (�������� ������)
* SHA-256 �ؽ���ȣȭ�� �ŷ� �������� �������� ����Դϴ�. 
*******************************************************
*/
DataEncrypt sha256Enc 	= new DataEncrypt();
String ediDate 			= getyyyyMMddHHmmss();												// ���� �����Ͻ�
String encData	 		= sha256Enc.encrypt(merchantID + ediDate + goodsAmt + merchantKey);	// Hash ��
%>
<!DOCTYPE html>
<html>
<head>
<meta charset="euc-kr">
<meta http-equiv="Cache-Control" content="no-cache" />
<meta name="viewport" content="width=device-width, height=device-height, initial-scale=1.0, minimum-scale=1.0, maximum-scale=3.0">
<title>KISPG  ���� ������</title>
<script src="https://ajax.aspnetcdn.com/ajax/jQuery/jquery-3.3.1.min.js"></script>
<style>
#mask {position:absolute;z-index:9000;background-color:#000;display:none;left:0;top:0;width:100%;height:100%;}
.window {display: none;position:fixed;top:0%;width:100%;height:100%;z-index:10000;}
.cont{width:100%;height:100%;}
</style>
</head>
<body>
<script type="text/javascript">

// �
//var url = "https://api.kispg.co.kr";
// �׽�Ʈ
var url = "https://testapi.kispg.co.kr";

function getResultUrl(resultPage) 
{ 
	var cur_url = location.href; 
	return cur_url.substring(0, cur_url.lastIndexOf('/')) + '/' + resultPage;
}

$(document).ready(function() {
	//����â ��û�� ����˴ϴ�.
	$("#payBtn").click(function (){
		document.payInit.returnUrl.value = getResultUrl("mPayResultSample.jsp") ;
		document.payInit.action = url + "/v2/auth";
		document.payInit.submit();
	});
	
});
</script>
<div style="text-align:center;">
<div id="sampleInput" class="paypop_con" style="padding:20px 15px 35px 15px;display: inline-block;float: none;">
<p class="square_tit mt0" style="text-align:left;"><strong>��������</strong></p>
<form name="payInit" method="post" accept-charset="utf-8">
	<table class="tbl_sty02">
		<tr>
			<td>��������</td>
			<td><input type="text" name="payMethod" value="card"></td>
		</tr>
		<tr>
			<td>����Ÿ��</td>
			<td><input type="text" name="trxCd" value="0"></td><!-- �Ϲ�(0)/����ũ��(1) --> 
		</tr>
		<tr>
			<td>������ID</td>
			<td><input type="text" name="mid" value="<%=merchantID%>"></td>
		</tr>
		<tr>
			<td>��ǰ��</td>
			<td><input type="text" name="goodsNm" value="<%=goodsNm%>"></td>
		</tr>
		<tr>
			<td>�ֹ���ȣ</td>
			<td><input type="text" name="ordNo" value="<%=ordNo%>"></td>
		</tr>
		<tr>
			<td>�����ݾ�</td>
			<td><input type="text" name="goodsAmt" value="<%=goodsAmt%>"></td>
		</tr>
		<tr>
			<td>�����ڸ�</td>
			<td><input type="text" name="ordNm" value="<%=ordNm%>"></td>
		</tr>
		<tr>
			<td>�����ڿ���ó</td>
			<td><input type="text" name="ordTel" value="<%=ordTel%>"></td>
		</tr>
		<tr>
			<td>�������̸���</td>
			<td><input type="text" name="ordEmail" value="<%=ordEmail%>"></td>
		</tr>
		<tr>
			<td>returnUrl</td>
			<td><input type="text" name="returnUrl" value=""></td>
		</tr>
	</table>
	<!-- �ɼ� --> 
	<input type="hidden" name="userIp"	value="0:0:0:0:0:0:0:1">
		
	<input type="hidden" name="mbsUsrId" value="user1234">
	<input type="hidden" name="ordGuardEmail" value="">
	<input type="hidden" name="rcvrAddr" value="����Ư����">
	<input type="hidden" name="rcvrPost" value="00100">
	<input type="hidden" name="mbsIp" value="127.0.0.1">
	<input type="hidden" name="mbsReserved" value="MallReserved"><!-- ���� �����ʵ� -->
	<input type="hidden" name="rcvrMsg" value="rcvrMsg">
	
	<input type="hidden" name="goodsSplAmt" value="0">
	<input type="hidden" name="goodsVat" value="0">
	<input type="hidden" name="goodsSvsAmt" value="0">
	<input type="hidden" name="payReqType" value="1">
	
	<input type="hidden" name="model" value="WEB">
	<input type="hidden" name="charSet" value="euc-kr">
	<!-- <input type="hidden" name="period" value="���� �����Ⱓ����"> -->
	<!-- <input type="hidden" name="billHpFlg" value="0"> -->
	<!-- <input type="hidden" name="model" value="MOB"> -->
	<!-- <input type="hidden" name="channel" value="0001"> -->
	
	<!-- ���� �Ұ��� -->
	<input type="hidden" name="ediDate" value="<%=ediDate%>"><!-- ���� �����Ͻ� -->
	<input type="hidden" name="encData" value="<%=encData%>"><!-- �ؽ��� -->

</form>	
	<a href="#;" id="payBtn" class="btn_sty01 bg01" style="margin:15px;">�����ϱ�</a>
	</div>
</div>
</body>
</html>
<%!
public final synchronized String getyyyyMMddHHmmss(){
	SimpleDateFormat yyyyMMddHHmmss = new SimpleDateFormat("yyyyMMddHHmmss");
	return yyyyMMddHHmmss.format(new Date());
}
// SHA-256 �������� ��ȣȭ
public class DataEncrypt{
	MessageDigest md;
	String strSRCData = "";
	String strENCData = "";
	String strOUTData = "";
	
	public DataEncrypt(){ }
	public String encrypt(String strData){
		String passACL = null;
		MessageDigest md = null;
		try{
			md = MessageDigest.getInstance("SHA-256");
			md.reset();
			md.update(strData.getBytes());
			byte[] raw = md.digest();
			passACL = encodeHex(raw);
		}catch(Exception e){
			System.out.print("��ȣȭ ����" + e.toString());
		}
		return passACL;
	}
	
	public String encodeHex(byte [] b){
		char [] c = Hex.encodeHex(b);
		return new String(c);
	}
}
%>